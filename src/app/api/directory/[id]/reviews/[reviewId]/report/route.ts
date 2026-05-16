import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { ReportReason } from '@prisma/client'
import { gatePublicRoute } from '@/lib/places/routeGate'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { recalcPlaceRating } from '@/lib/places/recalcRating'

export const dynamic = 'force-dynamic'

// Auto-hide threshold — 3 distinct reporters → the review's
// status flips to HIDDEN_BY_MOD (same end-state a mod-hide
// would produce) and gets pulled from the public list +
// rating average. Matches the post-report HIDE_THRESHOLD of 3.
const HIDE_THRESHOLD = 3
const MAX_REPORTS_PER_HOUR = 5
const VALID_REASONS = Object.values(ReportReason)

/**
 * POST /api/directory/[id]/reviews/[reviewId]/report
 *
 * Treats review reports like post reports (mirror of
 * /api/posts/report):
 *   - Auth required, requireUserReady-style gate via the
 *     existing public-route gate.
 *   - Caller can't be the review's author.
 *   - One report per (reporter, review) — pre-check returns a
 *     friendly Arabic error instead of letting the DB unique
 *     constraint surface raw.
 *   - Rate-limited: 5 reports/hour (across all targets); super
 *     admin bypasses.
 *   - On the 3rd distinct report, status flips to
 *     HIDDEN_BY_MOD and ratingAvg / ratingCount are
 *     recomputed — all inside the same txn so the counter
 *     can't drift if anything fails mid-flight.
 *
 * Body shape (POST JSON):
 *   { reason: ReportReason; details?: string }
 *
 * The `reason` enum is the SAME one the post-report route
 * uses — Wrong-category / Spam / Inappropriate / Scam /
 * Not-neighborhood / Offensive / Other — so the picker UI
 * can be shared if we ever build one.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; reviewId: string } },
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const gate = gatePublicRoute(user.role)
  if (gate) return gate

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const reason = typeof raw.reason === 'string' ? (raw.reason as ReportReason) : 'OTHER'
  if (!(VALID_REASONS as readonly string[]).includes(reason)) {
    return NextResponse.json({ error: 'سبب غير صالح' }, { status: 400 })
  }
  const details =
    typeof raw.details === 'string'
      ? raw.details.trim().slice(0, 500) || null
      : null

  // Rate limit (5/hour, bypassed for SUPER_ADMIN). Same window
  // and bypass rules as the post-report route.
  if (!isSuperAdminRole(user.role)) {
    const oneHourAgo = new Date(Date.now() - 3600_000)
    const recent = await db.placeReviewReport.count({
      where: { reporterId: user.id, createdAt: { gte: oneHourAgo } },
    })
    if (recent >= MAX_REPORTS_PER_HOUR) {
      return NextResponse.json({ error: 'حاول لاحقاً' }, { status: 429 })
    }
  }

  const review = await db.placeReview.findUnique({
    where: { id: params.reviewId },
    select: { id: true, placeId: true, userId: true, status: true, reportCount: true },
  })
  if (!review || review.placeId !== params.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  // Already hidden / soft-deleted reviews don't need more reports.
  if (review.status !== 'VISIBLE') {
    return NextResponse.json({ ok: true, already: true })
  }
  if (review.userId === user.id) {
    return NextResponse.json(
      { error: 'لا يمكنك الإبلاغ عن تقييمك' },
      { status: 400 },
    )
  }

  // Already reported by this user?
  const existing = await db.placeReviewReport.findUnique({
    where: { reporterId_reviewId: { reporterId: user.id, reviewId: review.id } },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json(
      { error: 'أبلغت عن هذا التقييم مسبقاً' },
      { status: 400 },
    )
  }

  const newCount = review.reportCount + 1
  const shouldHide = newCount >= HIDE_THRESHOLD

  await db.$transaction(async (tx) => {
    await tx.placeReviewReport.create({
      data: {
        reviewId: review.id,
        reporterId: user.id,
        reason: reason as ReportReason,
        details,
      },
    })
    await tx.placeReview.update({
      where: { id: review.id },
      data: {
        reportCount: newCount,
        ...(shouldHide ? { status: 'HIDDEN_BY_MOD' as const } : {}),
      },
    })
    if (shouldHide) {
      // Auto-hidden review drops out of the VISIBLE-only
      // aggregate; recalc inside the same txn.
      await recalcPlaceRating(review.placeId, tx)
    }
  })

  return NextResponse.json({ ok: true, hidden: shouldHide })
}

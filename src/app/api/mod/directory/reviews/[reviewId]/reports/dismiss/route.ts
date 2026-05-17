import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { isDirectoryModerator } from '@/lib/places/isDirectoryModerator'
import { logModAction } from '@/lib/modAudit'

export const dynamic = 'force-dynamic'

const REASON_MIN = 3
const REASON_MAX = 300

/**
 * POST /api/mod/directory/reviews/[reviewId]/reports/dismiss
 *
 * Mod / admin dismisses ALL pending reports against a review
 * in one action. Use case: a review was flagged but the mod
 * decided it's fine to keep — clear the queue without hiding
 * the review.
 *
 * Required body: { reason: string }  3..300 chars
 *
 * Effect:
 *   - Every PENDING report for the review → status DISMISSED,
 *     resolvedAt = now, resolvedById = mod.
 *   - PlaceReview.reportCount stays the same (it's the
 *     cumulative count — useful signal for repeat offenders).
 *   - PlaceReview.status untouched.
 *   - Audit row in ModActionLog with actionType=
 *     'dismiss_place_review_reports' and details=JSON({reason}).
 *
 * Permission: isDirectoryModerator. Scoped — NEIGHBORHOOD_MOD
 * may only dismiss reports on reviews in their own nbhd.
 */
export async function POST(req: NextRequest, { params }: { params: { reviewId: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!user || !isDirectoryModerator(user.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const reason = raw && typeof raw.reason === 'string' ? raw.reason.trim() : ''
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    return NextResponse.json(
      { error: 'سبب رفض البلاغ يجب أن يكون بين 3 و 300 حرف' },
      { status: 400 },
    )
  }

  const review = await db.placeReview.findUnique({
    where: { id: params.reviewId },
    select: {
      id: true,
      place: { select: { id: true, name: true, neighborhoodId: true } },
    },
  })
  if (!review) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // NEIGHBORHOOD_MOD scope. SUPER_ADMIN + PLATFORM_MOD bypass.
  const isSuper = isSuperAdminRole(user.role)
  const isNbhdMod = user.role === 'NEIGHBORHOOD_MOD'
  if (isNbhdMod && review.place.neighborhoodId !== user.neighborhoodId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  // Suppress unused-var for isSuper since the scope-check block
  // above handles all role combinations.
  void isSuper

  const result = await db.placeReviewReport.updateMany({
    where: { reviewId: review.id, status: 'PENDING' },
    data: {
      status: 'DISMISSED',
      resolvedAt: new Date(),
      resolvedById: user.id,
    },
  })

  await logModAction({
    moderatorId: user.id,
    actionType: 'dismiss_place_review_reports',
    targetType: 'review',
    targetId: review.id,
    neighborhoodId: review.place.neighborhoodId,
    details: JSON.stringify({ reason, dismissed: result.count }),
  })

  return NextResponse.json({ ok: true, dismissed: result.count })
}

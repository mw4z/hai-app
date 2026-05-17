import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { isDirectoryModerator } from '@/lib/places/isDirectoryModerator'
import { recalcPlaceRating } from '@/lib/places/recalcRating'
import { logModAction } from '@/lib/modAudit'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

const REASON_MIN = 3
const REASON_MAX = 300

/**
 * POST /api/mod/directory/reviews/[reviewId]/hide
 *
 * Mod / admin hides an inappropriate review. Required body:
 *   { reason: string }   (3-300 chars; saved to ModActionLog.details)
 *
 * Permission: isDirectoryModerator(role) — that's
 * NEIGHBORHOOD_MOD scoped to the review's place neighborhood,
 * PLATFORM_MOD anywhere, SUPER_ADMIN anywhere. Resident +
 * COMPOUND_ADMIN are excluded by the helper (per
 * project_session_apr16 memory). Owners CANNOT hide reviews.
 *
 * Sets status = HIDDEN_BY_MOD and recomputes ratingAvg /
 * ratingCount in the same transaction (hidden rows drop out
 * of the VISIBLE-only aggregate). The row stays in the table
 * so the reviewer can't dodge the hide by deleting +
 * recreating — POST /reviews already rejects on
 * status === HIDDEN_BY_MOD.
 *
 * Audit: ModActionLog row with actionType='hide_place_review',
 * details JSON.stringify({ reason }). Notify the reviewer
 * via NotificationType.SYSTEM so they know their review was
 * moderated.
 */
export async function POST(req: NextRequest, { params }: { params: { reviewId: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isDirectoryModerator(user.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const reasonRaw = raw && typeof raw.reason === 'string' ? raw.reason.trim() : ''
  if (reasonRaw.length < REASON_MIN || reasonRaw.length > REASON_MAX) {
    return NextResponse.json(
      { error: 'سبب الإخفاء يجب أن يكون بين 3 و 300 حرف' },
      { status: 400 },
    )
  }

  const review = await db.placeReview.findUnique({
    where: { id: params.reviewId },
    select: {
      id: true,
      status: true,
      userId: true,
      place: {
        select: { id: true, name: true, neighborhoodId: true },
      },
    },
  })
  if (!review) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (review.status === 'HIDDEN_BY_MOD') {
    return NextResponse.json({ ok: true, already: true })
  }

  // Neighborhood-mod scope: can only act inside their own
  // neighborhood. Platform mods + super admins are not scoped.
  const isSuper = isSuperAdminRole(user.role)
  const isNbhdMod = user.role === 'NEIGHBORHOOD_MOD'
  if (isNbhdMod && review.place.neighborhoodId !== user.neighborhoodId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  await db.$transaction(async (tx) => {
    await tx.placeReview.update({
      where: { id: review.id },
      data: { status: 'HIDDEN_BY_MOD' },
    })
    // Resolve every PENDING report for this review — they
    // were the trigger / signal; now that the review is
    // hidden they leave the mod queue with status=ACTION_TAKEN
    // and a snapshot of who acted + when.
    await tx.placeReviewReport.updateMany({
      where: { reviewId: review.id, status: 'PENDING' },
      data: {
        status: 'ACTION_TAKEN',
        resolvedAt: new Date(),
        resolvedById: user.id,
      },
    })
    await recalcPlaceRating(review.place.id, tx)
  })

  await logModAction({
    moderatorId: user.id,
    actionType: 'hide_place_review',
    targetType: 'review',
    targetId: review.id,
    neighborhoodId: review.place.neighborhoodId,
    details: JSON.stringify({ reason: reasonRaw }),
  })

  // Notify the reviewer (their review was hidden, here's why).
  await createNotification({
    type: 'SYSTEM',
    userId: review.userId,
    actorId: user.id,
    postId: review.place.id,
    postTitle: `تم إخفاء تقييمك على ${review.place.name} — ${reasonRaw.slice(0, 60)}`,
  }).catch(() => {})

  // Suppress unused-var warning for isSuper while keeping the
  // role-aware comment block above accurate.
  void isSuper

  return NextResponse.json({ ok: true })
}

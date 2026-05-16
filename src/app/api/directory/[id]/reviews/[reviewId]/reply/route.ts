import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { gatePublicRoute } from '@/lib/places/routeGate'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

const REPLY_MAX = 500

/**
 * POST /api/directory/[id]/reviews/[reviewId]/reply
 *
 * Claimed owner posts (or updates) their single reply to a
 * review. Constraints:
 *   - Caller must be the place's CURRENT claimedByUserId.
 *   - Review must belong to the given place AND be VISIBLE
 *     (no replying to hidden / deleted reviews).
 *   - Body length ≤ 500 chars.
 *   - Empty body is allowed and CLEARS the existing reply
 *     (lets an owner remove their reply without exposing a
 *     "delete review" path).
 *
 * On a fresh reply (no previous), notifies the reviewer:
 *   "رد صاحب المكان على تقييمك في {place.name}"
 * On an update, no re-notify.
 *
 * ownerReplyByUserId is a SNAPSHOT — kept as-is across
 * subsequent reply edits so we know who replied originally.
 * If the place changes claimant later, the new owner's POST
 * here overwrites both the body and the byUserId.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; reviewId: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const gate = gatePublicRoute(user.role)
  if (gate) return gate

  const place = await db.placeListing.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, claimedByUserId: true, status: true },
  })
  if (!place) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (place.claimedByUserId !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const review = await db.placeReview.findUnique({
    where: { id: params.reviewId },
    select: {
      id: true,
      placeId: true,
      userId: true,
      status: true,
      ownerReplyBody: true,
    },
  })
  if (!review || review.placeId !== place.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (review.status !== 'VISIBLE') {
    return NextResponse.json({ error: 'invalid_state' }, { status: 409 })
  }

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  const v = typeof raw.body === 'string' ? raw.body.trim() : ''
  if (v.length > REPLY_MAX) {
    return NextResponse.json({ error: 'الرد طويل' }, { status: 400 })
  }

  const isFirstReply = !review.ownerReplyBody

  await db.placeReview.update({
    where: { id: review.id },
    data: {
      ownerReplyBody: v || null,
      ownerReplyByUserId: v ? user.id : null,
      ownerReplyAt: v ? new Date() : null,
    },
  })

  // Notify the reviewer only on the FIRST reply (not on edits
  // and not when the owner clears the reply).
  if (v && isFirstReply && review.userId !== user.id) {
    await createNotification({
      type: 'SYSTEM',
      userId: review.userId,
      actorId: user.id,
      postId: place.id,
      postTitle: `رد صاحب المكان على تقييمك في ${place.name}`,
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}

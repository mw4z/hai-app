import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { gateModRoute } from '@/lib/places/routeGate'
import { logModAction } from '@/lib/modAudit'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

/** POST /api/mod/directory/claims/[id]/approve
 *  Sets PlaceListing.claimedByUserId = the requester, flips status
 *  to CLAIMED_BY_OWNER, marks the claim APPROVED. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const gate = gateModRoute(user.role)
  if (gate) return gate

  const claim = await db.placeClaimRequest.findUnique({
    where: { id: params.id },
    include: { place: { select: { id: true, name: true, neighborhoodId: true, claimedByUserId: true } } },
  })
  if (!claim) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (user.role === 'NEIGHBORHOOD_MOD' && claim.place.neighborhoodId !== user.neighborhoodId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (claim.status !== 'PENDING') {
    return NextResponse.json({ error: 'invalid_state' }, { status: 409 })
  }
  if (claim.place.claimedByUserId) {
    return NextResponse.json({ error: 'already_claimed' }, { status: 409 })
  }

  // Single transaction: link the user to the place AND finalize
  // the claim row. Other open claims on the same place auto-
  // CANCEL since only one owner can hold a place.
  await db.$transaction([
    db.placeListing.update({
      where: { id: claim.place.id },
      data: {
        claimedByUserId: claim.userId,
        status: 'CLAIMED_BY_OWNER',
        verifiedByModId: user.id,
        verifiedAt: new Date(),
      },
    }),
    db.placeClaimRequest.update({
      where: { id: claim.id },
      data: {
        status: 'APPROVED',
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    }),
    db.placeClaimRequest.updateMany({
      where: {
        placeId: claim.place.id,
        status: 'PENDING',
        NOT: { id: claim.id },
      },
      data: { status: 'CANCELLED' },
    }),
  ])

  await logModAction({
    moderatorId: user.id,
    actionType: 'approve_place_claim',
    targetType: 'place_claim',
    targetId: claim.id,
    neighborhoodId: claim.place.neighborhoodId,
    details: JSON.stringify({ placeId: claim.place.id, claimantId: claim.userId }),
  })

  await createNotification({
    type: 'SYSTEM',
    userId: claim.userId,
    actorId: user.id,
    actorName: 'مشرف الحي',
    postId: claim.place.id,
    postTitle: `تمت الموافقة على إدارتك لـ "${claim.place.name}"`,
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}

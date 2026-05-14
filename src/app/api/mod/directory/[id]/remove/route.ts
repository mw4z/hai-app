import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { gateModRoute } from '@/lib/places/routeGate'
import { logModAction } from '@/lib/modAudit'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

/** POST /api/mod/directory/[id]/remove
 *  Take down an already-visible place. Separate from /reject — that
 *  one is for rejecting a PENDING submission; this is for removing
 *  a place that had been published. Body: { reason: string }. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const gate = gateModRoute(user.role)
  if (gate) return gate

  const body = (await req.json().catch(() => ({}))) as { reason?: string }
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  if (reason.length < 3) {
    return NextResponse.json({ error: 'يرجى ذكر سبب الحذف' }, { status: 400 })
  }

  const place = await db.placeListing.findUnique({
    where: { id: params.id },
    select: { id: true, neighborhoodId: true, status: true, createdByUserId: true, claimedByUserId: true, name: true },
  })
  if (!place) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (user.role === 'NEIGHBORHOOD_MOD' && place.neighborhoodId !== user.neighborhoodId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (place.status === 'REMOVED' || place.status === 'REJECTED') {
    return NextResponse.json({ error: 'invalid_state' }, { status: 409 })
  }

  await db.placeListing.update({
    where: { id: place.id },
    data: {
      status: 'REMOVED',
      rejectionReason: reason,
      verifiedByModId: user.id,
      verifiedAt: new Date(),
    },
    select: { id: true },
  })

  // TODO(catalog-safety): when a dedicated claim-revoke path is
  // added later (or if this remove path ever clears
  // claimedByUserId), reset the previous owner's ServiceItems
  // back to showOnProfile=true so a place-only catalog doesn't
  // get orphaned with both visibility flags off (place page is
  // gone, profile-only flag was false). Today the remove path
  // leaves claimedByUserId intact and only flips status to
  // REMOVED, so the issue doesn't trigger — but capture the
  // dependency here for the future. Example reset:
  //   if (place.claimedByUserId) {
  //     await db.serviceItem.updateMany({
  //       where: { userId: place.claimedByUserId, showOnProfile: false },
  //       data: { showOnProfile: true },
  //     })
  //   }

  await logModAction({
    moderatorId: user.id,
    actionType: 'remove_place',
    targetType: 'place',
    targetId: place.id,
    neighborhoodId: place.neighborhoodId,
    details: JSON.stringify({ reason }),
  })

  // Notify the claimed owner if any; otherwise the original submitter.
  const recipientId = place.claimedByUserId || place.createdByUserId
  if (recipientId && recipientId !== user.id) {
    await createNotification({
      type: 'SYSTEM',
      userId: recipientId,
      actorId: user.id,
      actorName: 'مشرف الحي',
      postId: place.id,
      postTitle: `تم حذف "${place.name}" من دليل الحي — ${reason.slice(0, 60)}`,
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}

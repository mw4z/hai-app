import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { gateModRoute } from '@/lib/places/routeGate'
import { logModAction } from '@/lib/modAudit'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

/** POST /api/mod/directory/claims/[id]/reject
 *  Body: { reason: string } (required, min 3). */
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
    return NextResponse.json({ error: 'يرجى ذكر سبب الرفض' }, { status: 400 })
  }

  const claim = await db.placeClaimRequest.findUnique({
    where: { id: params.id },
    include: { place: { select: { id: true, name: true, neighborhoodId: true } } },
  })
  if (!claim) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (user.role === 'NEIGHBORHOOD_MOD' && claim.place.neighborhoodId !== user.neighborhoodId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (claim.status !== 'PENDING') {
    return NextResponse.json({ error: 'invalid_state' }, { status: 409 })
  }

  await db.placeClaimRequest.update({
    where: { id: claim.id },
    data: {
      status: 'REJECTED',
      rejectionReason: reason,
      reviewedById: user.id,
      reviewedAt: new Date(),
    },
  })

  await logModAction({
    moderatorId: user.id,
    actionType: 'reject_place_claim',
    targetType: 'place_claim',
    targetId: claim.id,
    neighborhoodId: claim.place.neighborhoodId,
    details: JSON.stringify({ placeId: claim.place.id, reason }),
  })

  await createNotification({
    type: 'SYSTEM',
    userId: claim.userId,
    actorId: user.id,
    actorName: 'مشرف الحي',
    postId: claim.place.id,
    postTitle: `لم تتم الموافقة على إدارة "${claim.place.name}" — ${reason.slice(0, 60)}`,
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}

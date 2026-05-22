import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { gatePublicRoute } from '@/lib/places/routeGate'
import { isValidServiceCategory } from '@/lib/services/serviceCategories'

export const dynamic = 'force-dynamic'

/**
 * POST /api/directory/service-contacts/[id]/claim
 * Body: { action: 'accept' | 'reject', displayName?, category?, description?, serviceArea? }
 *
 * Only the user whose phone was MATCHED (serviceIdentity.linkedUserId)
 * may act, and only on a PENDING_OWNER_CONFIRMATION contact.
 *   accept → identity.ownerUserId = me, verification CLAIMED, status
 *            ACTIVE, with the owner's chosen public fields.
 *   reject → status REMOVED (never publicly linked to the user).
 * linkedUserId is never exposed in any response.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const me = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const gate = gatePublicRoute(me.role)
  if (gate) return gate

  const body = await req.json().catch(() => ({}))
  const action = body?.action
  if (action !== 'accept' && action !== 'reject') {
    return NextResponse.json({ error: 'إجراء غير صالح' }, { status: 400 })
  }

  const contact = await db.directoryServiceContact.findUnique({
    where: { id: params.id },
    select: {
      id: true, verification: true, displayName: true, category: true,
      serviceIdentity: { select: { id: true, linkedUserId: true } },
    },
  })
  if (!contact) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  // Authorization: only the matched user can confirm their own number.
  if (contact.serviceIdentity.linkedUserId !== session.userId) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  }
  if (contact.verification !== 'PENDING_OWNER_CONFIRMATION') {
    return NextResponse.json({ error: 'لا يوجد طلب تأكيد على هذا الرقم' }, { status: 400 })
  }

  if (action === 'reject') {
    await db.directoryServiceContact.update({
      where: { id: contact.id },
      data: { status: 'REMOVED' },
    })
    return NextResponse.json({ success: true, action: 'rejected' })
  }

  // accept — apply the owner's chosen public fields.
  const displayName = typeof body.displayName === 'string' && body.displayName.trim().length >= 2
    ? body.displayName.trim().slice(0, 80)
    : contact.displayName
  const category = isValidServiceCategory(body.category) ? body.category : contact.category
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 280) || null : null
  const serviceArea = typeof body.serviceArea === 'string' ? body.serviceArea.trim().slice(0, 120) || null : null

  await db.$transaction([
    db.serviceIdentity.update({
      where: { id: contact.serviceIdentity.id },
      data: { ownerUserId: session.userId },
    }),
    db.directoryServiceContact.update({
      where: { id: contact.id },
      data: {
        verification: 'CLAIMED',
        status: 'ACTIVE',
        source: 'OWNER_SUBMITTED',
        displayName,
        category,
        description,
        serviceArea,
      },
    }),
  ])
  return NextResponse.json({ success: true, action: 'accepted' })
}

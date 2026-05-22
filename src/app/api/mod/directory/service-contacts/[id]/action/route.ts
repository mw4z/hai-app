import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { gateModRoute } from '@/lib/places/routeGate'
import { logModAction } from '@/lib/modAudit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/mod/directory/service-contacts/[id]/action
 * Body: { action: 'approve' | 'hide' | 'remove' | 'dismiss', reason? }
 *
 *   approve  → status ACTIVE (restore a HIDDEN contact). REFUSED for
 *              PENDING_OWNER_CONFIRMATION — publishing a number matched to
 *              a user is the owner's call, not a mod's.
 *   hide     → status HIDDEN.
 *   remove   → status REMOVED.
 *   dismiss  → reportCount = 0; if it was HIDDEN, restore to ACTIVE.
 *
 * Every action is written to ModActionLog. NEIGHBORHOOD_MOD is scoped to
 * their own neighborhood.
 */
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

  const body = await req.json().catch(() => ({}))
  const action = body?.action
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  if (!['approve', 'hide', 'remove', 'dismiss'].includes(action)) {
    return NextResponse.json({ error: 'إجراء غير صالح' }, { status: 400 })
  }

  const contact = await db.directoryServiceContact.findUnique({
    where: { id: params.id },
    select: { id: true, neighborhoodId: true, status: true, verification: true },
  })
  if (!contact) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (user.role === 'NEIGHBORHOOD_MOD' && contact.neighborhoodId !== user.neighborhoodId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let data: { status?: 'ACTIVE' | 'HIDDEN' | 'REMOVED'; reportCount?: number } = {}
  if (action === 'approve') {
    // Never publish an owner-confirmation match via the mod path.
    if (contact.verification === 'PENDING_OWNER_CONFIRMATION') {
      return NextResponse.json({ error: 'هذا الرقم بانتظار تأكيد صاحبه ولا يمكن نشره من المشرف' }, { status: 409 })
    }
    data = { status: 'ACTIVE' }
  } else if (action === 'hide') {
    data = { status: 'HIDDEN' }
  } else if (action === 'remove') {
    data = { status: 'REMOVED' }
  } else {
    // dismiss reports — clear the count and restore visibility if it was
    // auto-hidden by those reports.
    data = { reportCount: 0, ...(contact.status === 'HIDDEN' ? { status: 'ACTIVE' as const } : {}) }
  }

  await db.directoryServiceContact.update({ where: { id: contact.id }, data })

  await logModAction({
    moderatorId: user.id,
    actionType: `service_contact_${action}`,
    targetType: 'service_contact',
    targetId: contact.id,
    neighborhoodId: contact.neighborhoodId,
    details: reason ? JSON.stringify({ reason }) : undefined,
  })

  return NextResponse.json({ ok: true })
}

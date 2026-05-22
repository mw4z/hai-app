import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canManageInNeighborhood } from '@/lib/pinnedItems/pinnedItems'
import { logPinnedAudit } from '@/lib/pinnedItems/audit'

export const dynamic = 'force-dynamic'

/** POST — hide a pinned item (reason required). Keeps the row + the source
 *  intact; just removes it from residents. */
export async function POST(req: NextRequest, { params }: { params: { neighborhoodId: string; id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true, neighborhoodId: true } })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { reason } = await req.json().catch(() => ({}))
  const note = typeof reason === 'string' ? reason.trim().slice(0, 500) : ''
  if (note.length < 3) return NextResponse.json({ error: 'يرجى ذكر سبب الإخفاء' }, { status: 400 })

  const item = await db.neighborhoodPinnedItem.findUnique({ where: { id: params.id }, select: { id: true, neighborhoodId: true, status: true } })
  if (!item || item.neighborhoodId !== params.neighborhoodId) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!canManageInNeighborhood(user.role, user.neighborhoodId, item.neighborhoodId)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  await db.neighborhoodPinnedItem.update({
    where: { id: item.id },
    data: { status: 'HIDDEN', hiddenAt: new Date(), hiddenById: user.id, hiddenReason: note },
  })
  await logPinnedAudit({ pinnedItemId: item.id, actorId: user.id, action: 'HIDE', oldValue: { status: item.status }, newValue: { status: 'HIDDEN', reason: note } })
  return NextResponse.json({ ok: true })
}

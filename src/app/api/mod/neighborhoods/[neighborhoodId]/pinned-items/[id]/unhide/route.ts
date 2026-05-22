import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canManageInNeighborhood } from '@/lib/pinnedItems/pinnedItems'
import { logPinnedAudit } from '@/lib/pinnedItems/audit'

export const dynamic = 'force-dynamic'

/** POST — restore a hidden pinned item to ACTIVE. */
export async function POST(_req: NextRequest, { params }: { params: { neighborhoodId: string; id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true, neighborhoodId: true } })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const item = await db.neighborhoodPinnedItem.findUnique({ where: { id: params.id }, select: { id: true, neighborhoodId: true, status: true } })
  if (!item || item.neighborhoodId !== params.neighborhoodId) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!canManageInNeighborhood(user.role, user.neighborhoodId, item.neighborhoodId)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  await db.neighborhoodPinnedItem.update({
    where: { id: item.id },
    data: { status: 'ACTIVE', hiddenAt: null, hiddenById: null, hiddenReason: null },
  })
  await logPinnedAudit({ pinnedItemId: item.id, actorId: user.id, action: 'UNHIDE', oldValue: { status: item.status }, newValue: { status: 'ACTIVE' } })
  return NextResponse.json({ ok: true })
}

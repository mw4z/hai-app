import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canManageInNeighborhood } from '@/lib/pinnedItems/pinnedItems'
import { logPinnedAudit } from '@/lib/pinnedItems/audit'

export const dynamic = 'force-dynamic'

/** Load the item + verify the caller may manage it in this neighborhood. */
async function loadAndGate(neighborhoodId: string, id: string) {
  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true, neighborhoodId: true } })
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  const item = await db.neighborhoodPinnedItem.findUnique({
    where: { id },
    select: { id: true, neighborhoodId: true, title: true, summary: true, priority: true, status: true, expiresAt: true },
  })
  if (!item || item.neighborhoodId !== neighborhoodId) return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  if (!canManageInNeighborhood(user.role, user.neighborhoodId, item.neighborhoodId)) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }
  return { user, item }
}

/** PATCH — update title / summary / priority / expiresAt / status. */
export async function PATCH(req: NextRequest, { params }: { params: { neighborhoodId: string; id: string } }) {
  const g = await loadAndGate(params.neighborhoodId, params.id)
  if ('error' in g) return g.error
  const { user, item } = g

  const raw = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (typeof raw.title === 'string' && raw.title.trim().length >= 2) data.title = raw.title.trim().slice(0, 200)
  if ('summary' in raw) data.summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 1000) || null : null
  if (Number.isFinite(raw.priority)) data.priority = Math.max(0, Math.min(1000, Math.trunc(raw.priority)))
  if ('expiresAt' in raw) {
    if (raw.expiresAt === null) data.expiresAt = null
    else if (typeof raw.expiresAt === 'string') { const d = new Date(raw.expiresAt); if (!isNaN(d.getTime())) data.expiresAt = d }
  }
  if (typeof raw.status === 'string' && ['ACTIVE', 'EXPIRED', 'REMOVED'].includes(raw.status)) data.status = raw.status
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'لا تغييرات' }, { status: 400 })

  await db.neighborhoodPinnedItem.update({ where: { id: item.id }, data })
  const action = data.status === 'EXPIRED' ? 'EXPIRE' : data.status === 'REMOVED' ? 'REMOVE' : 'UPDATE'
  await logPinnedAudit({
    pinnedItemId: item.id, actorId: user.id, action,
    oldValue: { title: item.title, summary: item.summary, priority: item.priority, status: item.status, expiresAt: item.expiresAt },
    newValue: data,
  })
  return NextResponse.json({ ok: true })
}

/** DELETE — mark REMOVED. Does NOT delete the row or the original source. */
export async function DELETE(_req: NextRequest, { params }: { params: { neighborhoodId: string; id: string } }) {
  const g = await loadAndGate(params.neighborhoodId, params.id)
  if ('error' in g) return g.error
  const { user, item } = g
  if (item.status === 'REMOVED') return NextResponse.json({ ok: true })
  await db.neighborhoodPinnedItem.update({ where: { id: item.id }, data: { status: 'REMOVED' } })
  await logPinnedAudit({ pinnedItemId: item.id, actorId: user.id, action: 'REMOVE', oldValue: { status: item.status } })
  return NextResponse.json({ ok: true })
}

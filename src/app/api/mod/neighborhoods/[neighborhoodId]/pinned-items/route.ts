import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import {
  canManageInNeighborhood, isValidPinnedType, expiryFromDuration, type PinDuration,
} from '@/lib/pinnedItems/pinnedItems'
import { logPinnedAudit } from '@/lib/pinnedItems/audit'

export const dynamic = 'force-dynamic'

async function gate(neighborhoodId: string) {
  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true, neighborhoodId: true } })
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  if (!canManageInNeighborhood(user.role, user.neighborhoodId, neighborhoodId)) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }
  return { user }
}

/** GET — mod management view: ALL statuses (active/hidden/expired/removed). */
export async function GET(_req: NextRequest, { params }: { params: { neighborhoodId: string } }) {
  const g = await gate(params.neighborhoodId)
  if ('error' in g) return g.error

  const rows = await db.neighborhoodPinnedItem.findMany({
    where: { neighborhoodId: params.neighborhoodId },
    orderBy: [{ priority: 'desc' }, { pinnedAt: 'desc' }],
    take: 200,
    select: {
      id: true, type: true, sourceType: true, sourceId: true, title: true, summary: true,
      fileUrl: true, linkUrl: true, status: true, priority: true, pinnedAt: true, expiresAt: true,
      hiddenAt: true, hiddenReason: true,
      pinnedBy: { select: { name: true } },
    },
  })
  return NextResponse.json({
    items: rows.map((r) => ({
      ...r,
      pinnedBy: r.pinnedBy?.name ?? null,
      pinnedAt: r.pinnedAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      hiddenAt: r.hiddenAt?.toISOString() ?? null,
    })),
  })
}

/** POST — create a pinned item. Pinning the same source twice updates the
 *  existing pin (re-activates + refreshes) instead of duplicating. */
export async function POST(req: NextRequest, { params }: { params: { neighborhoodId: string } }) {
  const g = await gate(params.neighborhoodId)
  if ('error' in g) return g.error
  const { user } = g

  const raw = await req.json().catch(() => null)
  if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  const type = raw.type
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 200) : ''
  if (!isValidPinnedType(type)) return NextResponse.json({ error: 'نوع غير صالح' }, { status: 400 })
  if (title.length < 2) return NextResponse.json({ error: 'العنوان مطلوب' }, { status: 400 })

  const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 1000) || null : null
  const fileUrl = typeof raw.fileUrl === 'string' ? raw.fileUrl.trim().slice(0, 1000) || null : null
  const linkUrl = typeof raw.linkUrl === 'string' ? raw.linkUrl.trim().slice(0, 1000) || null : null
  const sourceType = typeof raw.sourceType === 'string' ? raw.sourceType.trim().slice(0, 32) || null : null
  const sourceId = typeof raw.sourceId === 'string' ? raw.sourceId.trim().slice(0, 64) || null : null
  const priority = Number.isFinite(raw.priority) ? Math.max(0, Math.min(1000, Math.trunc(raw.priority))) : 0
  const duration: PinDuration = ['24h', '7d', '30d', 'forever', 'custom'].includes(raw.duration) ? raw.duration : 'forever'
  const expiresAt = expiryFromDuration(duration, new Date(), typeof raw.customExpiry === 'string' ? raw.customExpiry : null)

  // Duplicate-pin: same source already pinned (any status) → re-activate +
  // refresh rather than create a second row.
  if (sourceType && sourceId) {
    const existing = await db.neighborhoodPinnedItem.findUnique({
      where: { neighborhoodId_sourceType_sourceId: { neighborhoodId: params.neighborhoodId, sourceType, sourceId } },
      select: { id: true },
    })
    if (existing) {
      const updated = await db.neighborhoodPinnedItem.update({
        where: { id: existing.id },
        data: { type, title, summary, fileUrl, linkUrl, priority, expiresAt, status: 'ACTIVE', hiddenAt: null, hiddenById: null, hiddenReason: null },
        select: { id: true },
      })
      await logPinnedAudit({ pinnedItemId: updated.id, actorId: user.id, action: 'UPDATE', newValue: { title, summary, expiresAt, reactivated: true } })
      return NextResponse.json({ ok: true, id: updated.id, deduped: true })
    }
  }

  const created = await db.neighborhoodPinnedItem.create({
    data: {
      neighborhoodId: params.neighborhoodId, type, sourceType, sourceId,
      title, summary, fileUrl, linkUrl, priority, expiresAt,
      status: 'ACTIVE', pinnedById: user.id,
    },
    select: { id: true },
  })
  await logPinnedAudit({ pinnedItemId: created.id, actorId: user.id, action: 'PIN', newValue: { type, title, summary, sourceType, sourceId, expiresAt } })
  return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
}

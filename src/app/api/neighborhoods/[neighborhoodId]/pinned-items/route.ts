import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { unavailableSourceItemIds } from '@/lib/pinnedItems/resolveSource'

export const dynamic = 'force-dynamic'

/**
 * GET /api/neighborhoods/[neighborhoodId]/pinned-items
 * Resident view: ACTIVE, not hidden, not expired pinned items — ordered by
 * priority then recency. Visibility is the pinned item's OWN state; we do
 * NOT consult the source post's feed/highlight expiry. The resolver only
 * drops items whose source was deleted or moderation-removed.
 */
export async function GET(_req: NextRequest, { params }: { params: { neighborhoodId: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const now = new Date()
  const rows = await db.neighborhoodPinnedItem.findMany({
    where: {
      neighborhoodId: params.neighborhoodId,
      status: 'ACTIVE',
      hiddenAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: [{ priority: 'desc' }, { pinnedAt: 'desc' }],
    take: 100,
    select: {
      id: true, type: true, sourceType: true, sourceId: true,
      title: true, summary: true, fileUrl: true, linkUrl: true,
      pinnedAt: true, expiresAt: true,
    },
  })

  const unavailable = await unavailableSourceItemIds(rows)
  const items = rows
    .filter((r) => !unavailable.has(r.id))
    .map((r) => ({
      id: r.id, type: r.type, sourceType: r.sourceType, sourceId: r.sourceId,
      title: r.title, summary: r.summary, fileUrl: r.fileUrl, linkUrl: r.linkUrl,
      pinnedAt: r.pinnedAt.toISOString(), expiresAt: r.expiresAt?.toISOString() ?? null,
    }))

  return NextResponse.json({ items })
}

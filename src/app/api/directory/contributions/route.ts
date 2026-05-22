import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/directory/contributions — the caller's own Directory
 * contribution history (pending / approved / needs-edit / rejected /
 * duplicate), newest first, with the points actually awarded (from the
 * idempotent ReputationEvent) so the UI can show "+5" next to approved
 * rows. Scoped strictly to the current user.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rows = await db.directoryContribution.findMany({
    where: { contributorId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, type: true, status: true, potentialDuplicate: true,
      reviewNote: true, reviewedAt: true, createdAt: true,
      place: { select: { id: true, name: true } },
    },
  })

  // Points awarded per contribution (idempotent ReputationEvent rows).
  const ids = rows.map((r) => r.id)
  const events = ids.length
    ? await db.reputationEvent.findMany({
        where: { sourceType: 'directory_contribution', sourceId: { in: ids } },
        select: { sourceId: true, points: true },
      })
    : []
  const pointsBySource = new Map(events.map((e) => [e.sourceId, e.points]))

  return NextResponse.json({
    contributions: rows.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      placeName: r.place?.name ?? null,
      placeId: r.place?.id ?? null,
      potentialDuplicate: r.potentialDuplicate,
      reviewNote: r.reviewNote,
      points: pointsBySource.get(r.id) ?? 0,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    })),
  })
}

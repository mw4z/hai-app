import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { DIRECTORY_DAILY_CAP, DIRECTORY_SOURCE_TYPE } from '@/lib/reputation/directoryRewards'
import { getReputationBreakdown } from '@/lib/reputation/visibleReputation'
import { extractChangedFields, dailyCapEarned } from '@/lib/directory/contributions'

export const dynamic = 'force-dynamic'

/**
 * GET /api/directory/contributions — the caller's own contribution history
 * plus a summary header. Scoped strictly to the current user; returns ONLY
 * safe fields (no contributorId / reviewedById / neighborhoodId / groupId /
 * potentialDuplicate / identity). reviewNote is exposed only for
 * REJECTED/DUPLICATE rows (the rejection reason is meant for the user).
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rows = await db.directoryContribution.findMany({
    where: { contributorId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: 150,
    select: {
      id: true, type: true, status: true, payloadJson: true,
      reviewNote: true, reviewedAt: true, createdAt: true,
      place: { select: { name: true } },
      neighborhood: { select: { name: true } },
    },
  })

  // Points per contribution + lifetime + today (idempotent ReputationEvent).
  const ids = rows.map((r) => r.id)
  const events = ids.length
    ? await db.reputationEvent.findMany({
        where: { sourceType: DIRECTORY_SOURCE_TYPE, sourceId: { in: ids } },
        select: { sourceId: true, points: true },
      })
    : []
  const pointsBySource = new Map(events.map((e) => [e.sourceId, e.points]))

  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
  const [breakdown, today] = await Promise.all([
    getReputationBreakdown(session.userId),
    db.reputationEvent.aggregate({ where: { userId: session.userId, sourceType: DIRECTORY_SOURCE_TYPE, createdAt: { gte: startOfDay } }, _sum: { points: true } }),
  ])

  // ONE visible reputation ("السمعة") with an explanation breakdown — the
  // total merges social + directory; directory never alters the social
  // (enforcement) score.
  const summary = {
    reputation: breakdown.total,             // the one visible number
    socialPoints: breakdown.social,          // النشاط الاجتماعي
    directoryContributionPoints: breakdown.directoryContributions, // مساهمات دليل الحي
    directoryReportPoints: breakdown.directoryReports,             // البلاغات الصحيحة
    pending: rows.filter((r) => r.status === 'PENDING_REVIEW' || r.status === 'NEEDS_EDIT').length,
    approved: rows.filter((r) => r.status === 'APPROVED').length,
    rejected: rows.filter((r) => r.status === 'REJECTED' || r.status === 'DUPLICATE').length,
    total: rows.length,
  }
  const dailyCap = { earnedToday: dailyCapEarned(today._sum.points || 0, DIRECTORY_DAILY_CAP), cap: DIRECTORY_DAILY_CAP }

  const contributions = rows.map((r) => {
    const showNote = r.status === 'REJECTED' || r.status === 'DUPLICATE'
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      placeName: r.place?.name ?? null,
      neighborhoodName: r.neighborhood?.name ?? null,
      points: pointsBySource.get(r.id) ?? 0,
      reviewNote: showNote ? r.reviewNote : null,
      changedFields: extractChangedFields(r.payloadJson),
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    }
  })

  return NextResponse.json({ summary, dailyCap, contributions })
}

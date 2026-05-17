import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { isDirectoryModerator } from '@/lib/places/isDirectoryModerator'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

/**
 * GET /api/mod/directory/reviews/reports
 *
 * Mod-only listing of PENDING PlaceReviewReports grouped by
 * reviewId. Powers the "بلاغات التقييمات" tab in
 * /mod/directory.
 *
 * Scope:
 *   - SUPER_ADMIN / PLATFORM_MOD see all neighborhoods.
 *   - NEIGHBORHOOD_MOD sees only reports on reviews whose
 *     place.neighborhoodId === user.neighborhoodId.
 *   - COMPOUND_ADMIN excluded by isDirectoryModerator (per
 *     project_session_apr16 memory).
 *
 * Each entry returns: review excerpt + place + author + the
 * reporter list (id + name + reason + createdAt) + first/
 * latest report timestamps + currentUserHasReported flag so
 * the UI can show a "you reported this" badge.
 *
 * Already-actioned / dismissed reports are excluded — they
 * stay in the DB as audit but don't clutter the queue.
 */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!user || !isDirectoryModerator(user.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const cross = isSuperAdminRole(user.role) || user.role === 'PLATFORM_MOD'
  const placeScope = cross
    ? {}
    : { place: { neighborhoodId: user.neighborhoodId ?? '__none__' } }

  // Pull pending reports, joined to review + place + reporter,
  // ordered by newest report first. The grouping happens in
  // application code — Postgres has GROUP BY but Prisma's
  // groupBy() doesn't compose with nested relations the way
  // we need, and the data set per page is bounded.
  const rows = await db.placeReviewReport.findMany({
    where: {
      status: 'PENDING',
      review: {
        // Only surface reports on reviews that are still
        // VISIBLE — once the review is hidden (mod or auto),
        // pending reports have already been marked ACTION_TAKEN
        // by the hide path, so this is belt-and-suspenders.
        status: 'VISIBLE',
        ...placeScope,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE * 5, // give us room to group up to ~50 reviews
    select: {
      id: true,
      reason: true,
      details: true,
      createdAt: true,
      reporter: { select: { id: true, name: true, avatarUrl: true } },
      review: {
        select: {
          id: true,
          rating: true,
          body: true,
          createdAt: true,
          reportCount: true,
          user: { select: { id: true, name: true, avatarUrl: true, providerStatus: true } },
          place: {
            select: {
              id: true,
              name: true,
              category: true,
              status: true,
              neighborhoodId: true,
            },
          },
        },
      },
    },
  })

  // Group in application code.
  const grouped = new Map<
    string,
    {
      review: (typeof rows)[number]['review']
      reports: { id: string; reason: string; details: string | null; createdAt: string; reporter: { id: string; name: string | null; avatarUrl: string | null } }[]
      firstReportAt: string
      latestReportAt: string
      currentUserHasReported: boolean
    }
  >()
  for (const r of rows) {
    const key = r.review.id
    const entry = grouped.get(key)
    const reportItem = {
      id: r.id,
      reason: r.reason as string,
      details: r.details,
      createdAt: r.createdAt.toISOString(),
      reporter: {
        id: r.reporter.id,
        name: r.reporter.name,
        avatarUrl: r.reporter.avatarUrl,
      },
    }
    const isMine = r.reporter.id === user.id
    if (entry) {
      entry.reports.push(reportItem)
      // Order is DESC by createdAt globally; per-group first is
      // the oldest seen so far, latest is the newest seen first.
      if (r.createdAt.toISOString() < entry.firstReportAt) {
        entry.firstReportAt = r.createdAt.toISOString()
      }
      if (isMine) entry.currentUserHasReported = true
    } else {
      grouped.set(key, {
        review: r.review,
        reports: [reportItem],
        firstReportAt: r.createdAt.toISOString(),
        latestReportAt: r.createdAt.toISOString(),
        currentUserHasReported: isMine,
      })
    }
  }

  // Cap at PAGE_SIZE groups, ordered by latestReportAt desc.
  const groups = Array.from(grouped.values())
    .sort((a, b) => (a.latestReportAt < b.latestReportAt ? 1 : -1))
    .slice(0, PAGE_SIZE)
    .map((g) => {
      // Reasons summary: ordered count, descending.
      const counts: Record<string, number> = {}
      for (const r of g.reports) counts[r.reason] = (counts[r.reason] ?? 0) + 1
      const reasonsSummary = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([reason, count]) => ({ reason, count }))

      // Body excerpt — first 200 chars of review body.
      const bodyExcerpt = g.review.body
        ? g.review.body.slice(0, 200) + (g.review.body.length > 200 ? '…' : '')
        : null

      return {
        review: {
          id: g.review.id,
          rating: g.review.rating,
          bodyExcerpt,
          createdAt: g.review.createdAt.toISOString(),
          reportCount: g.review.reportCount,
          author: g.review.user,
          place: {
            id: g.review.place.id,
            name: g.review.place.name,
            category: g.review.place.category,
            status: g.review.place.status,
          },
        },
        reporterCount: g.reports.length,
        reports: g.reports,
        reasonsSummary,
        firstReportAt: g.firstReportAt,
        latestReportAt: g.latestReportAt,
        currentUserHasReported: g.currentUserHasReported,
      }
    })

  return NextResponse.json({ groups })
}

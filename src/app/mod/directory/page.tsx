import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { directoryServerMode } from '@/lib/places/featureFlag'
import { isDirectoryModerator } from '@/lib/places/isDirectoryModerator'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { toModPlace } from '@/lib/places/serialize'
import ModDirectoryClient from './ModDirectoryClient'

export const dynamic = 'force-dynamic'

/** Mod-only directory dashboard. Three tabs: pending places,
 *  pending claims, recent reports. Each row has the right inline
 *  actions for the row's domain (approve / reject / open detail). */
export default async function ModDirectoryPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!user) redirect('/login')

  // Server-flag gate: even in admin mode this page is reachable
  // by directory moderators only. RESIDENTs / COMPOUND_ADMINs hit
  // notFound() here.
  const mode = directoryServerMode()
  if (mode === 'off' && !isSuperAdminRole(user.role)) notFound()
  if (mode === 'admin' && !isDirectoryModerator(user.role)) notFound()
  if (mode === 'on' && !isDirectoryModerator(user.role)) notFound()

  const cross = isSuperAdminRole(user.role) || user.role === 'PLATFORM_MOD'
  const nbhdScope = cross ? {} : { neighborhoodId: user.neighborhoodId ?? '__none__' }

  const [pendingPlaces, pendingClaims, recentReports, pendingReviewReportRows] = await Promise.all([
    db.placeListing.findMany({
      where: { status: 'PENDING', ...nbhdScope },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: {
        claimedByUser: { select: { id: true, name: true, avatarUrl: true, providerStatus: true } },
        createdByUser: { select: { id: true, name: true } },
        verifiedByMod:  { select: { id: true, name: true } },
      },
    }),
    db.placeClaimRequest.findMany({
      where: {
        status: 'PENDING',
        ...(cross ? {} : { place: { neighborhoodId: user.neighborhoodId ?? '__none__' } }),
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: {
        user: { select: { id: true, name: true, providerStatus: true, reputation: true } },
        place: { select: { id: true, name: true, category: true, status: true } },
      },
    }),
    db.placeReport.findMany({
      where: cross
        ? { status: 'PENDING' }
        : { status: 'PENDING', place: { neighborhoodId: user.neighborhoodId ?? '__none__' } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, name: true } },
        place: { select: { id: true, name: true, category: true, status: true } },
      },
    }),
    // PENDING review reports — for the "بلاغات التقييمات" tab.
    // Pulled raw here; the client groups by reviewId so a single
    // review with 3 reports renders as one card with reporter list.
    db.placeReviewReport.findMany({
      where: {
        status: 'PENDING',
        review: {
          status: 'VISIBLE',
          ...(cross ? {} : { place: { neighborhoodId: user.neighborhoodId ?? '__none__' } }),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 250,
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
            place: { select: { id: true, name: true, category: true, status: true } },
          },
        },
      },
    }),
  ])

  // Group review-report rows by reviewId so the client doesn't
  // have to. Same shape the GET /api/mod/directory/reviews/reports
  // route returns — keeps SSR + later refresh paths consistent.
  type ReviewReportRow = (typeof pendingReviewReportRows)[number]
  const groupedMap = new Map<string, {
    review: ReviewReportRow['review']
    reports: { id: string; reason: string; details: string | null; createdAt: string; reporter: { id: string; name: string | null; avatarUrl: string | null } }[]
    firstReportAt: string
    latestReportAt: string
    currentUserHasReported: boolean
  }>()
  for (const r of pendingReviewReportRows) {
    const key = r.review.id
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
    const existing = groupedMap.get(key)
    if (existing) {
      existing.reports.push(reportItem)
      if (r.createdAt.toISOString() < existing.firstReportAt) {
        existing.firstReportAt = r.createdAt.toISOString()
      }
      if (isMine) existing.currentUserHasReported = true
    } else {
      groupedMap.set(key, {
        review: r.review,
        reports: [reportItem],
        firstReportAt: r.createdAt.toISOString(),
        latestReportAt: r.createdAt.toISOString(),
        currentUserHasReported: isMine,
      })
    }
  }
  const reviewReportGroups = Array.from(groupedMap.values())
    .sort((a, b) => (a.latestReportAt < b.latestReportAt ? 1 : -1))
    .map((g) => {
      const counts: Record<string, number> = {}
      for (const r of g.reports) counts[r.reason] = (counts[r.reason] ?? 0) + 1
      const reasonsSummary = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([reason, count]) => ({ reason, count }))
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

  return (
    <ModDirectoryClient
      data={JSON.parse(JSON.stringify({
        pendingPlaces: pendingPlaces.map(toModPlace),
        pendingClaims: pendingClaims.map((c) => ({
          id: c.id,
          message: c.message,
          createdAt: c.createdAt.toISOString(),
          user: c.user,
          place: c.place,
        })),
        recentReports: recentReports.map((r) => ({
          id: r.id,
          type: r.type,
          message: r.message,
          createdAt: r.createdAt.toISOString(),
          reporter: r.user,
          place: r.place,
        })),
        reviewReportGroups,
      }))}
    />
  )
}

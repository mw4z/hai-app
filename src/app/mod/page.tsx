import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import ModDashboard from './ModDashboard'
import { directoryServerMode } from '@/lib/places/featureFlag'
import { isDirectoryModerator } from '@/lib/places/isDirectoryModerator'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'

export default async function ModPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, status: true, neighborhoodId: true, name: true, lastName: true, neighborhood: { select: { name: true, nameEn: true } } },
  })
  if (!user || user.role === 'RESIDENT') redirect('/feed')
  if (!user.neighborhoodId) redirect('/feed')
  // A stopped/banned mod loses dashboard access — the gate previously
  // checked role only, so a "stopped" mod kept full moderator access.
  if (user.status === 'BANNED_TEMP' || user.status === 'BANNED_PERM') redirect('/feed')

  // Fetch mod dashboard data (scoped to their neighborhood)
  const nbId = user.neighborhoodId
  const isPlatform = user.role === 'PLATFORM_MOD' || user.role === 'SUPER_ADMIN'

  // Account-level user reports. Routed by the REPORTER's neighborhood
  // — the mod team serves residents, so their local mods see reports
  // filed by those residents, regardless of which neighborhood the
  // reported user lives in. Platform-level admins see everything.
  const userReportWhere = isPlatform
    ? { status: 'PENDING' as const }
    : { status: 'PENDING' as const, reporter: { neighborhoodId: nbId } }

  const [reportedPosts, hiddenPosts, bannedUsers, recentLogs, userReports, stats] = await Promise.all([
    // Reported posts in their neighborhood
    db.post.findMany({
      where: { neighborhoodId: nbId, reportCount: { gt: 0 }, status: { in: ['ACTIVE', 'IN_PROGRESS'] } },
      select: {
        id: true, title: true, body: true, category: true, reportCount: true, createdAt: true,
        author: { select: { id: true, name: true, lastName: true, phone: true, reputation: true } },
      },
      orderBy: { reportCount: 'desc' },
      take: 20,
    }),

    // Hidden posts
    db.post.findMany({
      where: { neighborhoodId: nbId, status: 'HIDDEN' },
      select: {
        id: true, title: true, category: true, createdAt: true,
        author: { select: { name: true, lastName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),

    // Banned users in neighborhood
    db.user.findMany({
      where: { neighborhoodId: nbId, status: { in: ['BANNED_TEMP', 'BANNED_PERM'] } },
      select: { id: true, name: true, lastName: true, phone: true, status: true, reputation: true },
    }),

    // Recent mod logs by this user
    db.moderationLog.findMany({
      where: { adminId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, action: true, targetType: true, reason: true, createdAt: true },
    }),

    // Pending account-level user reports
    db.userReport.findMany({
      where: userReportWhere,
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        id: true,
        reason: true,
        details: true,
        source: true,
        postId: true,
        conversationId: true,
        listingId: true,
        createdAt: true,
        reportedUser: {
          select: { id: true, name: true, lastName: true, reputation: true, avatarUrl: true, neighborhood: { select: { name: true, nameEn: true } } },
        },
        reporter: {
          select: { id: true, name: true, lastName: true, reputation: true },
        },
      },
    }),

    // Stats
    Promise.all([
      db.post.count({ where: { neighborhoodId: nbId, status: 'ACTIVE' } }),
      db.post.count({ where: { neighborhoodId: nbId, reportCount: { gt: 0 } } }),
      db.user.count({ where: { neighborhoodId: nbId } }),
      db.moderationLog.count({ where: { adminId: session.userId } }),
    ]),
  ])

  // Directory feature flag — render the dashboard "دليل الحي" pill
  // only when the server flag is admin/on AND the user has the
  // directory mod role. Pending counts are fetched in the same
  // tick so the badge stays accurate without a client round-trip.
  const mode = directoryServerMode()
  const directoryEnabled =
    isDirectoryModerator(user.role) &&
    (mode === 'on' || mode === 'admin' || isSuperAdminRole(user.role))

  let directoryCounts = { places: 0, claims: 0, reports: 0 }
  if (directoryEnabled) {
    const cross = isSuperAdminRole(user.role) || user.role === 'PLATFORM_MOD'
    const nbhdFilter = cross ? {} : { neighborhoodId: nbId }
    const placeNbhdFilter = cross ? {} : { place: { neighborhoodId: nbId } }
    const [places, claims, reports] = await Promise.all([
      db.placeListing.count({ where: { status: 'PENDING', ...nbhdFilter } }),
      db.placeClaimRequest.count({ where: { status: 'PENDING', ...placeNbhdFilter } }),
      db.placeReport.count({ where: placeNbhdFilter }),
    ])
    directoryCounts = { places, claims, reports }
  }

  return (
    <ModDashboard
      data={JSON.parse(JSON.stringify({
        user: { name: user.name, lastName: user.lastName, role: user.role, neighborhood: user.neighborhood?.name, neighborhoodEn: user.neighborhood?.nameEn },
        reportedPosts,
        hiddenPosts,
        bannedUsers,
        recentLogs,
        userReports,
        stats: {
          activePosts: stats[0],
          reportedPosts: stats[1],
          totalUsers: stats[2],
          myActions: stats[3],
        },
        directoryEnabled,
        directoryCounts,
      }))}
    />
  )
}

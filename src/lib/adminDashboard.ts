import { db } from '@/lib/db'
import { shouldArchivePost } from '@/lib/postExpiry'
import { UserStatus } from '@prisma/client'

const ADMIN_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']

export interface AdminDashboardData {
  role: string
  stats: {
    pendingRequests: number
    reportedPosts: number
    hiddenPosts: number
    totalUsers: number
    bannedUsers: number
    totalPosts: number
    pendingUserReports: number
    pendingModReports: number
  }
  recentLogs: any[]
  adminUsers: any[]
  neighborhoodStats: any[]
  modHealth: any[]
}

/**
 * Builds the admin/mod overview dashboard payload for a given user.
 * Returns `null` if the user isn't an admin/mod (caller decides whether
 * that's a 403 or a redirect). Shared by GET /api/admin/dashboard (live
 * 15s refresh) and the server-rendered /admin page (first paint).
 */
export async function getAdminDashboardData(userId: string): Promise<AdminDashboardData | null> {
  const admin = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, neighborhoodId: true, gender: true },
  })
  if (!admin || !ADMIN_ROLES.includes(admin.role)) return null

  const isSuper = admin.role === 'SUPER_ADMIN'
  const isPlatform = admin.role === 'PLATFORM_MOD' || isSuper

  const nbhdFilter = isPlatform ? {} : { neighborhoodId: admin.neighborhoodId! }
  const womenOnlyFilter = admin.gender !== 'FEMALE' ? { audience: { not: 'WOMEN' as any } } : {}

  const activeUserFilter = {
    ...(nbhdFilter.neighborhoodId ? { neighborhoodId: nbhdFilter.neighborhoodId } : {}),
    deletedAt: null,
    isSeed: false,
    isVerified: true,
    addressVerified: true,
    status: { notIn: [UserStatus.BANNED_TEMP, UserStatus.BANNED_PERM] },
  }

  const [
    pendingRequests,
    reportedPosts,
    hiddenPosts,
    totalUsers,
    bannedUsers,
    livePostsRaw,
    recentLogs,
    adminUsers,
    neighborhoodStats,
    pendingUserReports,
    modHealth,
    pendingModReports,
  ] = await Promise.all([
    db.neighborhoodChangeRequest.count({ where: { status: 'pending' } }),
    db.post.count({ where: { ...nbhdFilter, ...womenOnlyFilter, status: 'HIDDEN' } }),
    db.post.count({ where: { ...nbhdFilter, ...womenOnlyFilter, status: 'REMOVED' } }),
    db.user.count({ where: activeUserFilter }),
    db.user.count({ where: { status: { in: ['BANNED_TEMP', 'BANNED_PERM'] }, deletedAt: null, isSeed: false, isVerified: true, addressVerified: true, ...(nbhdFilter.neighborhoodId ? { neighborhoodId: nbhdFilter.neighborhoodId } : {}) } }),
    db.post.findMany({
      where: { ...nbhdFilter, status: { in: ['ACTIVE', 'IN_PROGRESS'] }, author: { isSeed: false, isVerified: true, addressVerified: true } },
      select: {
        id: true,
        category: true,
        // Needed by shouldArchivePost — REQUEST posts get the
        // community-ask 7-day lifetime regardless of category.
        intent: true,
        createdAt: true,
        activeThreadId: true,
        isPinned: true,
        _count: { select: { comments: true } },
      },
    }),
    db.moderationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    isSuper ? db.user.findMany({
      where: { role: { not: 'RESIDENT' } },
      select: { id: true, name: true, lastName: true, phone: true, role: true },
      orderBy: { role: 'asc' },
    }) : [],
    db.city.findMany({
      select: { name: true, _count: { select: { neighborhoods: true } } },
    }),
    db.userReport.count({
      where: {
        status: 'PENDING',
        ...(isPlatform ? {} : { reporter: { neighborhoodId: admin.neighborhoodId! } }),
      },
    }),
    db.user.findMany({
      where: {
        role: 'NEIGHBORHOOD_MOD',
        deletedAt: null,
        modStatus: { in: ['UNDER_REVIEW', 'INACTIVE', 'SUSPENDED'] },
        ...(isPlatform ? {} : { neighborhoodId: admin.neighborhoodId! }),
      },
      select: {
        id: true,
        name: true,
        lastName: true,
        avatarUrl: true,
        neighborhoodId: true,
        modStatus: true,
        lastModActionAt: true,
        modActionsCount: true,
        modReportCount: true,
      },
      take: 25,
    }),
    db.userReport.count({
      where: {
        status: 'PENDING',
        isModeratorTarget: true,
        ...(isPlatform ? {} : { reporter: { neighborhoodId: admin.neighborhoodId! } }),
      },
    }),
  ])

  const totalPosts = livePostsRaw.filter(p => !shouldArchivePost(p)).length

  return JSON.parse(JSON.stringify({
    role: admin.role,
    stats: { pendingRequests, reportedPosts, hiddenPosts, totalUsers, bannedUsers, totalPosts, pendingUserReports, pendingModReports },
    recentLogs,
    adminUsers,
    neighborhoodStats,
    modHealth,
  }))
}

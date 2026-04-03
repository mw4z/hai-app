import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

const ADMIN_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true },
  })
  if (!admin || !ADMIN_ROLES.includes(admin.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const isSuper = admin.role === 'SUPER_ADMIN'
  const isPlatform = admin.role === 'PLATFORM_MOD' || isSuper

  // Scoping: neighborhood mods only see their neighborhood
  const nbhdFilter = isPlatform ? {} : { neighborhoodId: admin.neighborhoodId! }

  const [
    pendingRequests,
    reportedPosts,
    hiddenPosts,
    totalUsers,
    bannedUsers,
    totalPosts,
    recentLogs,
    adminUsers,
    neighborhoodStats,
  ] = await Promise.all([
    db.neighborhoodChangeRequest.count({ where: { status: 'pending' } }),
    db.post.count({ where: { ...nbhdFilter, status: 'HIDDEN' } }),
    db.post.count({ where: { ...nbhdFilter, status: 'REMOVED' } }),
    db.user.count({ where: nbhdFilter.neighborhoodId ? { neighborhoodId: nbhdFilter.neighborhoodId } : {} }),
    db.user.count({ where: { status: { in: ['BANNED_TEMP', 'BANNED_PERM'] }, ...(nbhdFilter.neighborhoodId ? { neighborhoodId: nbhdFilter.neighborhoodId } : {}) } }),
    db.post.count({ where: { ...nbhdFilter, status: { in: ['ACTIVE', 'IN_PROGRESS'] } } }),
    db.moderationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    isSuper ? db.user.findMany({
      where: { role: { not: 'RESIDENT' } },
      select: { id: true, name: true, phone: true, role: true },
      orderBy: { role: 'asc' },
    }) : [],
    db.city.findMany({
      select: { name: true, _count: { select: { neighborhoods: true } } },
    }),
  ])

  return NextResponse.json({
    role: admin.role,
    stats: { pendingRequests, reportedPosts, hiddenPosts, totalUsers, bannedUsers, totalPosts },
    recentLogs: JSON.parse(JSON.stringify(recentLogs)),
    adminUsers,
    neighborhoodStats,
  })
}

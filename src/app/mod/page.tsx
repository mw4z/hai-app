import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import ModDashboard from './ModDashboard'

export default async function ModPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true, name: true, neighborhood: { select: { name: true, nameEn: true } } },
  })
  if (!user || user.role === 'RESIDENT') redirect('/feed')
  if (!user.neighborhoodId) redirect('/feed')

  // Fetch mod dashboard data (scoped to their neighborhood)
  const nbId = user.neighborhoodId

  const [reportedPosts, hiddenPosts, bannedUsers, recentLogs, stats] = await Promise.all([
    // Reported posts in their neighborhood
    db.post.findMany({
      where: { neighborhoodId: nbId, reportCount: { gt: 0 }, status: { in: ['ACTIVE', 'IN_PROGRESS'] } },
      select: {
        id: true, title: true, body: true, category: true, reportCount: true, createdAt: true,
        author: { select: { id: true, name: true, phone: true, reputation: true } },
      },
      orderBy: { reportCount: 'desc' },
      take: 20,
    }),

    // Hidden posts
    db.post.findMany({
      where: { neighborhoodId: nbId, status: 'HIDDEN' },
      select: {
        id: true, title: true, category: true, createdAt: true,
        author: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),

    // Banned users in neighborhood
    db.user.findMany({
      where: { neighborhoodId: nbId, status: { in: ['BANNED_TEMP', 'BANNED_PERM'] } },
      select: { id: true, name: true, phone: true, status: true, reputation: true },
    }),

    // Recent mod logs by this user
    db.moderationLog.findMany({
      where: { adminId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, action: true, targetType: true, reason: true, createdAt: true },
    }),

    // Stats
    Promise.all([
      db.post.count({ where: { neighborhoodId: nbId, status: 'ACTIVE' } }),
      db.post.count({ where: { neighborhoodId: nbId, reportCount: { gt: 0 } } }),
      db.user.count({ where: { neighborhoodId: nbId } }),
      db.moderationLog.count({ where: { adminId: session.userId } }),
    ]),
  ])

  return (
    <ModDashboard
      data={JSON.parse(JSON.stringify({
        user: { name: user.name, role: user.role, neighborhood: user.neighborhood?.name, neighborhoodEn: user.neighborhood?.nameEn },
        reportedPosts,
        hiddenPosts,
        bannedUsers,
        recentLogs,
        stats: {
          activePosts: stats[0],
          reportedPosts: stats[1],
          totalUsers: stats[2],
          myActions: stats[3],
        },
      }))}
    />
  )
}

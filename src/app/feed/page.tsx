import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import FeedClient from './FeedClient'
import { PostCategory } from '@prisma/client'
import { getFeedBoost } from '@/lib/reputation-levels'
import { cached } from '@/lib/cache'
import { shouldArchivePost } from '@/lib/postExpiry'

export default async function FeedPage({
  searchParams,
}: {
  searchParams: { category?: string; neighborhood?: string }
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  // Cache user for 2 minutes — avoids re-fetching on every tab switch
  const user = await cached(`user:${session.userId}`, 120_000, () =>
    db.user.findUnique({
      where: { id: session.userId },
      include: { neighborhood: { include: { city: true } } },
    })
  )

  if (!user?.neighborhoodId) redirect('/onboarding')

  const category = searchParams.category || 'ALL'
  const browseNeighborhoodId = searchParams.neighborhood
  const isReadOnly = !!(browseNeighborhoodId && browseNeighborhoodId !== user.neighborhoodId)
  const activeNeighborhoodId = isReadOnly ? browseNeighborhoodId : user.neighborhoodId!

  const isFemale = user.gender === 'FEMALE'

  let categoryFilter: object
  if (category === 'ALL') {
    categoryFilter = isFemale ? {} : { category: { not: PostCategory.WOMEN_ONLY } }
  } else if (category === 'WOMEN_ONLY') {
    categoryFilter = isFemale ? { category: PostCategory.WOMEN_ONLY } : { id: '' }
  } else {
    categoryFilter = { category: category as PostCategory }
  }

  // Run all DB queries in parallel
  const [posts, unreadNotifCount, browseNeighborhood, bookmarkedIds] = await Promise.all([
    // Posts — cache 30s per neighborhood+category combo
    cached(`feed:${activeNeighborhoodId}:${category}:${isFemale}`, 30_000, () =>
      db.post.findMany({
        where: {
          neighborhoodId: activeNeighborhoodId,
          status: { in: ['ACTIVE', 'IN_PROGRESS'] },
          ...categoryFilter,
        },
        include: {
          author: { select: { id: true, name: true, reputation: true, accountType: true, role: true, avatarUrl: true, coverUrl: true, gender: true, createdAt: true, bio: true, serviceDescription: true, serviceAddress: true, serviceLat: true, serviceLng: true, neighborhood: { select: { name: true, nameEn: true } }, _count: { select: { posts: true } } } },
          reactions: { select: { emoji: true, userId: true } },
          _count: { select: { comments: true, reactions: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    ),
    // Unread notifications — cache 30s
    cached(`notif:${session.userId}`, 30_000, () =>
      db.notification.count({
        where: { userId: session.userId, read: false },
      })
    ),
    // Browse neighborhood (only if needed)
    isReadOnly
      ? cached(`nbhd:${activeNeighborhoodId}`, 300_000, () =>
          db.neighborhood.findUnique({
            where: { id: activeNeighborhoodId },
            include: { city: true },
          })
        )
      : null,
    // User's bookmarked post IDs
    cached(`bookmarks:${session.userId}`, 60_000, () =>
      db.bookmark.findMany({
        where: { userId: session.userId },
        select: { postId: true },
      }).then(b => b.map(x => x.postId))
    ),
  ])

  if (isReadOnly && !browseNeighborhood) redirect('/feed')

  // Filter out expired posts + archive them in background
  const activePosts = posts.filter(p => !shouldArchivePost(p))
  const expiredIds = posts.filter(p => shouldArchivePost(p)).map(p => p.id)
  if (expiredIds.length > 0) {
    db.post.updateMany({
      where: { id: { in: expiredIds } },
      data: { status: 'ARCHIVED' },
    }).catch(() => {})
  }

  const TYPE_BOOST: Record<string, number> = {
    ALERT: 5, NEIGHBORHOOD_ISSUE: 4, LOOKING_FOR: 3, LOST_FOUND: 2, MOSQUE: 2,
  }
  const COMMERCIAL = new Set(['MARKETPLACE', 'FOOD_HOME', 'REAL_ESTATE', 'SERVICES'])

  // Score with time decay
  const scored = activePosts.map(p => {
    if (p.isPinned) return { ...p, _score: 999999 }
    if (p.isFeatured) return { ...p, _score: 999998 }
    const hoursAgo = (Date.now() - new Date(p.createdAt).getTime()) / 3600_000
    const engagement = Math.min(p._count.comments * 3 + p._count.reactions, 30)
    const boost = TYPE_BOOST[p.category] || 0
    const repBoost = getFeedBoost(p.author.reputation)
    return { ...p, _score: (50 + engagement + boost + repBoost) / (hoursAgo + 2) }
  }).sort((a, b) => b._score - a._score)

  // Anti-domination: max 2 consecutive posts per same author
  const deduped: typeof scored = []
  const deferred: typeof scored = []
  for (const post of scored) {
    const last2 = deduped.slice(-2)
    if (last2.length === 2 && last2.every(p => p.authorId === post.authorId)) {
      deferred.push(post)
    } else {
      deduped.push(post)
    }
  }

  // Commercial balance
  const balanced: typeof deduped = []
  let commercialStreak = 0
  for (const post of [...deduped, ...deferred]) {
    if (COMMERCIAL.has(post.category)) {
      commercialStreak++
      if (commercialStreak >= 3) { balanced.push(post); continue }
    } else {
      commercialStreak = 0
    }
    balanced.push(post)
  }

  return (
    <FeedClient
      user={{
        id: user.id,
        name: user.name,
        gender: user.gender,
        phone: user.phone,
        neighborhood: user.neighborhood?.name || '',
        neighborhoodEn: user.neighborhood?.nameEn || '',
        city: user.neighborhood?.city.name || '',
        cityEn: user.neighborhood?.city.nameEn || '',
        neighborhoodId: user.neighborhoodId!,
        role: user.role,
      }}
      initialPosts={JSON.parse(JSON.stringify(balanced))}
      selectedCategory={category}
      isReadOnly={isReadOnly}
      browseNeighborhood={browseNeighborhood ? {
        id: browseNeighborhood.id,
        name: browseNeighborhood.name,
        nameEn: browseNeighborhood.nameEn,
        cityName: browseNeighborhood.city.name,
        cityNameEn: browseNeighborhood.city.nameEn,
      } : null}
      allNeighborhoods={[]}
      bookmarkedIds={bookmarkedIds || []}
      unreadNotifCount={unreadNotifCount}
      hasNeighborhoodMod={true}
    />
  )
}

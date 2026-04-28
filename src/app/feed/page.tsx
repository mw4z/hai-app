import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import FeedClient from './FeedClient'
import { PostCategoryV2 } from '@prisma/client'
import { getFeedBoost } from '@/lib/reputation-levels'
import { cached } from '@/lib/cache'
import { shouldArchivePost } from '@/lib/postExpiry'

// v2 chip values posted by the feed UI — internal reads/writes go
// through the v2 column directly during Phase 3 read-flag-on era.
const V2_FILTER_VALUES: readonly string[] = [
  'HOME_BUSINESSES','MARKETPLACE','SERVICES','RIDES','REAL_ESTATE',
  'LOST_FOUND','NEIGHBORHOOD_REPORTS','EVENTS','COMPETITIONS','GENERAL',
]

export default async function FeedPage({
  searchParams,
}: {
  searchParams: { category?: string; neighborhood?: string }
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  // Always fetch fresh — caching here caused an onboarding loop on Vercel
  // when a stale row with neighborhoodId=null survived across instances.
  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { neighborhood: { include: { city: true } } },
  })

  if (!user?.neighborhoodId) redirect('/onboarding')

  const category = searchParams.category || 'ALL'
  const browseNeighborhoodId = searchParams.neighborhood
  const isReadOnly = !!(browseNeighborhoodId && browseNeighborhoodId !== user.neighborhoodId)
  const activeNeighborhoodId = isReadOnly ? browseNeighborhoodId : user.neighborhoodId!

  const isFemale = user.gender === 'FEMALE'

  // Audience-based ALL: female viewers see every audience; everyone
  // else gets WOMEN-targeted posts filtered out via the audience field.
  // v2 chips route through the v2 column directly. Anything else (a
  // legacy chip slipping through somehow) falls through with no
  // category filter — defensive.
  let categoryFilter: object
  if (category === 'ALL') {
    categoryFilter = isFemale ? {} : { audience: { not: 'WOMEN' } }
  } else if (V2_FILTER_VALUES.includes(category)) {
    categoryFilter = { newCategory: category as PostCategoryV2 }
  } else {
    categoryFilter = {}
  }

  // Run all DB queries in parallel
  const [posts, unreadNotifCount, browseNeighborhood, bookmarkedIds, followedIds] = await Promise.all([
    // Posts — cache 30s per neighborhood+category combo
    cached(`feed:${activeNeighborhoodId}:${category}:${isFemale}`, 30_000, () =>
      db.post.findMany({
        where: {
          neighborhoodId: activeNeighborhoodId,
          status: { in: ['ACTIVE', 'IN_PROGRESS'] },
          ...categoryFilter,
        },
        include: {
          author: { select: { id: true, name: true, lastName: true, reputation: true, accountType: true, providerStatus: true, role: true, avatarUrl: true, coverUrl: true, gender: true, showGender: true, createdAt: true, bio: true, serviceDescription: true, serviceAddress: true, serviceLat: true, serviceLng: true, socialLinks: true, neighborhood: { select: { name: true, nameEn: true } }, _count: { select: { posts: true } } } },
          reactions: { select: { emoji: true, userId: true } },
          _count: { select: { comments: true, reactions: true } },
          // Preview comment — most-liked root comment, shipped with the
          // feed so the comment line renders on first paint instead of
          // popping in ~1s later via a per-card follow-up fetch.
          comments: {
            where: { parentId: null },
            orderBy: [
              { likes: { _count: 'desc' } },
              { createdAt: 'desc' },
            ],
            take: 1,
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  lastName: true,
                  reputation: true,
                  accountType: true,
                  providerStatus: true,
                  avatarUrl: true,
                },
              },
              _count: { select: { likes: true } },
            },
          },
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
    // Post IDs the user has subscribed to — drives the "Follow post"
    // overflow-menu state so the button shows the right label on
    // first paint instead of flashing from "Follow" to "Unfollow".
    cached(`postsubs:${session.userId}`, 60_000, () =>
      db.postSubscription.findMany({
        where: { userId: session.userId },
        select: { postId: true },
      }).then(s => s.map(x => x.postId))
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

  // v2 boost map. NEIGHBORHOOD_REPORTS absorbs legacy ALERT +
  // NEIGHBORHOOD_ISSUE; EVENTS keeps the small MOSQUE bump. Request
  // posts are boosted via intent === 'REQUEST' below, replacing the
  // legacy LOOKING_FOR boost.
  const TYPE_BOOST: Partial<Record<PostCategoryV2, number>> = {
    NEIGHBORHOOD_REPORTS: 5, LOST_FOUND: 2, EVENTS: 2,
  }
  const COMMERCIAL = new Set<PostCategoryV2>(['MARKETPLACE', 'HOME_BUSINESSES', 'REAL_ESTATE', 'SERVICES'])

  // Score with time decay
  const scored = activePosts.map(p => {
    if (p.isPinned) return { ...p, _score: 999999 }
    if (p.isFeatured) return { ...p, _score: 999998 }
    const hoursAgo = (Date.now() - new Date(p.createdAt).getTime()) / 3600_000
    const engagement = Math.min(p._count.comments * 3 + p._count.reactions, 30)
    const boost = (p.newCategory && TYPE_BOOST[p.newCategory]) || 0
    const intentBoost = p.intent === 'REQUEST' ? 3 : 0
    const repBoost = getFeedBoost(p.author.reputation)
    return { ...p, _score: (50 + engagement + boost + intentBoost + repBoost) / (hoursAgo + 2) }
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
    if (post.newCategory && COMMERCIAL.has(post.newCategory)) {
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
        lastName: user.lastName,
        gender: user.gender,
        phone: user.phone,
        neighborhood: user.neighborhood?.name || '',
        neighborhoodEn: user.neighborhood?.nameEn || '',
        city: user.neighborhood?.city.name || '',
        cityEn: user.neighborhood?.city.nameEn || '',
        neighborhoodId: user.neighborhoodId!,
        role: user.role,
      }}
      initialPosts={JSON.parse(JSON.stringify(balanced.map((p: any) => {
        // Move SSR preview from `comments` into `previewComments` so the
        // PostCard can seed its comment-row state without confusing
        // "preview" with "full thread" (which it still lazy-loads on open).
        // Also flatten `_count.likes` → `likeCount` so the heart badge
        // renders with zero extra work client-side.
        const { comments, ...rest } = p
        const previewComments = Array.isArray(comments)
          ? comments.map((c: any) => ({
              id: c.id,
              body: c.body,
              imageUrl: c.imageUrl ?? null,
              createdAt: c.createdAt,
              author: c.author,
              likeCount: c._count?.likes ?? 0,
              replies: [],
            }))
          : []
        return {
          ...rest,
          previewComments,
          author: rest.author
            ? {
                ...rest.author,
                // Respect author's privacy: hide gender if they opted out
                gender: rest.author.showGender === false ? null : rest.author.gender,
                showGender: undefined,
              }
            : rest.author,
        }
      })))}
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
      followedIds={followedIds || []}
      unreadNotifCount={unreadNotifCount}
      hasNeighborhoodMod={true}
      addressVerified={!!user.addressVerified}
    />
  )
}

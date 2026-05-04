import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getValidatedSession } from '@/lib/auth-server'
import { PostCategory } from '@prisma/client'
import { getFeedBoost } from '@/lib/reputation-levels'
import { requireCompleteProfile } from '@/lib/requireCompleteProfile'

const V2_FILTER_VALUES: readonly string[] = [
  'HOME_BUSINESSES','MARKETPLACE','SERVICES','RIDES','REAL_ESTATE',
  'LOST_FOUND','NEIGHBORHOOD_REPORTS','EVENTS','COMPETITIONS','GENERAL',
]

// v2 boost map. NEIGHBORHOOD_REPORTS absorbs the legacy ALERT +
// NEIGHBORHOOD_ISSUE boosts (top of the list); EVENTS keeps the small
// MOSQUE bump. Request-style "looking for" posts boost via the intent
// field at the call site (see scorePost) rather than via category.
const TYPE_BOOST: Partial<Record<PostCategory, number>> = {
  NEIGHBORHOOD_REPORTS: 5,
  LOST_FOUND: 2,
  EVENTS: 2,
}

const COMMERCIAL_TYPES = new Set<PostCategory>(['MARKETPLACE', 'HOME_BUSINESSES', 'REAL_ESTATE', 'SERVICES'])
const PAGE_SIZE = 20

function scorePost(post: {
  createdAt: Date
  category: PostCategory | null
  intent: string | null
  isPinned: boolean
  isFeatured: boolean
  _count: { comments: number; reactions: number }
}) {
  if (post.isPinned) return 999999
  if (post.isFeatured) return 999998

  const hoursAgo = (Date.now() - new Date(post.createdAt).getTime()) / 3600_000
  const engagement = Math.min(post._count.comments * 3 + post._count.reactions, 30)
  const typeBoost = (post.category && TYPE_BOOST[post.category]) || 0
  // Replicate the legacy LOOKING_FOR +3 boost via intent: REQUEST.
  const intentBoost = post.intent === 'REQUEST' ? 3 : 0
  const repBoost = getFeedBoost((post as any).author?.reputation || 0)
  const base = 50 + engagement + typeBoost + intentBoost + repBoost

  return base / (hoursAgo + 2)
}

/** Prevent one user from dominating: max 2 consecutive posts per author */
function deduplicateAuthors<T extends { authorId: string }>(posts: T[]): T[] {
  const result: T[] = []
  const deferred: T[] = []

  for (const post of posts) {
    const last2 = result.slice(-2)
    if (last2.length === 2 && last2.every(p => p.authorId === post.authorId)) {
      deferred.push(post)
    } else {
      result.push(post)
    }
  }

  // Re-insert deferred posts at end
  return [...result, ...deferred]
}

/** Ensure at least 1 non-commercial post every 3 posts */
function balanceCommercial<T extends { category: PostCategory | null }>(posts: T[]): T[] {
  const result: T[] = []
  let commercialStreak = 0

  const isCommercial = (p: T) => p.category != null && COMMERCIAL_TYPES.has(p.category)
  const nonCommercial = posts.filter(p => !isCommercial(p))
  const ncQueue = [...nonCommercial]
  const seen = new Set<number>()

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]
    if (isCommercial(post)) {
      commercialStreak++
      if (commercialStreak >= 3 && ncQueue.length > 0) {
        // Insert a non-commercial post to break the streak
        const nc = ncQueue.shift()!
        const ncIdx = posts.indexOf(nc)
        if (ncIdx > i && !seen.has(ncIdx)) {
          seen.add(ncIdx)
          result.push(nc)
          commercialStreak = 0
        }
      }
      result.push(post)
    } else {
      commercialStreak = 0
      if (!seen.has(i)) result.push(post)
    }
  }
  return result
}

export async function GET(req: NextRequest) {
  const session = await getValidatedSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const incompleteGate = await requireCompleteProfile(session.userId)
  if (incompleteGate) return incompleteGate

  const { searchParams } = new URL(req.url)
  const neighborhoodId = searchParams.get('neighborhoodId')
  const category = searchParams.get('category') || 'ALL'
  const cursor = searchParams.get('cursor')
  const gender = searchParams.get('gender')

  if (!neighborhoodId) return NextResponse.json({ error: 'neighborhoodId required' }, { status: 400 })

  const isFemale = gender === 'FEMALE'
  // Audience-based ALL: female viewers see every audience; everyone
  // else gets WOMEN-targeted posts filtered out. v2 chips route
  // through the v2 column directly. REQUESTS is a special intent-only
  // chip — no category filter, just intent='REQUEST'. MARKETPLACE
  // additionally pins intent='OFFER' so request posts don't pollute
  // the marketplace browsing experience.
  let categoryFilter: object
  if (category === 'ALL') {
    categoryFilter = isFemale ? {} : { audience: { not: 'WOMEN' } }
  } else if (category === 'REQUESTS') {
    categoryFilter = { intent: 'REQUEST' }
  } else if (category === 'MARKETPLACE') {
    categoryFilter = { category: 'MARKETPLACE' as PostCategory, intent: 'OFFER' }
  } else if (V2_FILTER_VALUES.includes(category)) {
    categoryFilter = { category: category as PostCategory }
  } else {
    categoryFilter = {}
  }

  const posts = await db.post.findMany({
    where: {
      neighborhoodId,
      status: 'ACTIVE',
      ...categoryFilter,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    include: {
      author: { select: { id: true, name: true, lastName: true, reputation: true, accountType: true, providerStatus: true, role: true, avatarUrl: true, coverUrl: true, gender: true, showGender: true, createdAt: true, bio: true, serviceDescription: true, serviceAddress: true, serviceLat: true, serviceLng: true, socialLinks: true, neighborhood: { select: { name: true, nameEn: true } }, _count: { select: { posts: true } } } },
      reactions: { select: { emoji: true, userId: true } },
      _count: { select: { comments: true, reactions: true } },
      // Preview comment ships with each paginated post too — keeps the
      // "no 1-second comment pop-in" guarantee consistent with the
      // initial SSR payload in /feed/page.tsx.
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
    take: PAGE_SIZE + 1,
  })

  const hasMore = posts.length > PAGE_SIZE
  if (hasMore) posts.pop()

  // Score and sort
  const scored = posts
    .map(p => ({ ...p, _score: scorePost(p) }))
    .sort((a, b) => b._score - a._score)

  // Anti-domination + commercial balance
  const balanced = balanceCommercial(deduplicateAuthors(scored))

  const nextCursor = posts.length > 0
    ? posts[posts.length - 1].createdAt.toISOString()
    : null

  // Respect each author's privacy: strip gender if they opted out.
  // Also reshape the Prisma `comments` sub-result into `previewComments`
  // (with flattened likeCount) so the client matches the SSR contract.
  const sanitized = balanced.map((p: any) => {
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
            gender: rest.author.showGender === false ? null : rest.author.gender,
            showGender: undefined,
          }
        : rest.author,
    }
  })

  return NextResponse.json({
    posts: sanitized,
    nextCursor,
    hasMore,
  })
}

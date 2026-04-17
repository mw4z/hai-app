import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getValidatedSession } from '@/lib/auth-server'
import { PostCategory } from '@prisma/client'
import { getFeedBoost } from '@/lib/reputation-levels'

const TYPE_BOOST: Partial<Record<PostCategory, number>> = {
  ALERT: 5,
  NEIGHBORHOOD_ISSUE: 4,
  LOOKING_FOR: 3,
  LOST_FOUND: 2,
  MOSQUE: 2,
}

const COMMERCIAL_TYPES = new Set(['MARKETPLACE', 'FOOD_HOME', 'REAL_ESTATE', 'SERVICES'])
const PAGE_SIZE = 20

function scorePost(post: {
  createdAt: Date
  category: PostCategory
  isPinned: boolean
  isFeatured: boolean
  _count: { comments: number; reactions: number }
}) {
  if (post.isPinned) return 999999
  if (post.isFeatured) return 999998

  const hoursAgo = (Date.now() - new Date(post.createdAt).getTime()) / 3600_000
  const engagement = Math.min(post._count.comments * 3 + post._count.reactions, 30)
  const typeBoost = TYPE_BOOST[post.category] || 0
  const repBoost = getFeedBoost((post as any).author?.reputation || 0)
  const base = 50 + engagement + typeBoost + repBoost

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
function balanceCommercial<T extends { category: string }>(posts: T[]): T[] {
  const result: T[] = []
  let commercialStreak = 0

  const nonCommercial = posts.filter(p => !COMMERCIAL_TYPES.has(p.category))
  const ncQueue = [...nonCommercial]
  const seen = new Set<number>()

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]
    if (COMMERCIAL_TYPES.has(post.category)) {
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

  const { searchParams } = new URL(req.url)
  const neighborhoodId = searchParams.get('neighborhoodId')
  const category = searchParams.get('category') || 'ALL'
  const cursor = searchParams.get('cursor')
  const gender = searchParams.get('gender')

  if (!neighborhoodId) return NextResponse.json({ error: 'neighborhoodId required' }, { status: 400 })

  const isFemale = gender === 'FEMALE'
  let categoryFilter: object
  if (category === 'ALL') {
    categoryFilter = isFemale ? {} : { category: { not: PostCategory.WOMEN_ONLY } }
  } else if (category === 'WOMEN_ONLY') {
    categoryFilter = isFemale ? { category: PostCategory.WOMEN_ONLY } : { id: '' }
  } else {
    categoryFilter = { category: category as PostCategory }
  }

  const posts = await db.post.findMany({
    where: {
      neighborhoodId,
      status: 'ACTIVE',
      ...categoryFilter,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    include: {
      author: { select: { id: true, name: true, reputation: true, accountType: true, providerStatus: true, role: true, avatarUrl: true, coverUrl: true, gender: true, showGender: true, createdAt: true, bio: true, serviceDescription: true, serviceAddress: true, serviceLat: true, serviceLng: true, neighborhood: { select: { name: true, nameEn: true } }, _count: { select: { posts: true } } } },
      reactions: { select: { emoji: true, userId: true } },
      _count: { select: { comments: true, reactions: true } },
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

  // Respect each author's privacy: strip gender if they opted out
  const sanitized = balanced.map((p: any) => ({
    ...p,
    author: p.author
      ? {
          ...p.author,
          gender: p.author.showGender === false ? null : p.author.gender,
          showGender: undefined,
        }
      : p.author,
  }))

  return NextResponse.json({
    posts: sanitized,
    nextCursor,
    hasMore,
  })
}

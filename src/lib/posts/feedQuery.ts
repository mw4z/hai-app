import { db } from '@/lib/db'
import type { Prisma, PostCategory, PostAudience } from '@prisma/client'

export interface FeedFilter {
  neighborhoodId: string
  category?: PostCategory | null
  /** caller's gender — used to enforce audience targeting on the feed */
  viewerGender?: 'MALE' | 'FEMALE' | 'UNSPECIFIED' | null
  cursor?: string | null
  limit?: number
}

export async function fetchFeed(f: FeedFilter) {
  const limit = Math.min(f.limit ?? 20, 50)

  const audienceClause: Prisma.PostWhereInput['audience'] | undefined =
    f.viewerGender === 'FEMALE'
      ? { in: ['ALL', 'WOMEN'] satisfies PostAudience[] }
      : f.viewerGender === 'MALE'
        ? { in: ['ALL', 'MEN'] satisfies PostAudience[] }
        : 'ALL'

  const categoryClause: Prisma.PostWhereInput = f.category
    ? { category: f.category }
    : {}

  const rows = await db.post.findMany({
    where: {
      neighborhoodId: f.neighborhoodId,
      status: 'ACTIVE',
      ...categoryClause,
      audience: audienceClause,
    },
    orderBy: [
      { isPinned:   'desc' },
      { isFeatured: 'desc' },
      { isPaid:     'desc' },
      { priority:   'desc' }, // CRITICAL > HIGH > NORMAL > LOW
      { createdAt:  'desc' },
    ],
    take: limit + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
  })

  const nextCursor = rows.length > limit ? rows[limit - 1].id : null
  return { items: rows.slice(0, limit), nextCursor }
}

/** Render-time helper — UI shows a small badge for REQUEST posts. */
export function intentBadge(intent: 'OFFER' | 'REQUEST' | 'NORMAL'): string | null {
  if (intent === 'REQUEST') return 'طلب'
  if (intent === 'OFFER')   return 'عرض'
  return null
}

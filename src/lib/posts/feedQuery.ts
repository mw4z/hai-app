/**
 * Feed query — flag-gated. When USE_NEW_CATEGORY is on, filters use
 * the v2 column directly. When off, falls back to mapping the v2
 * filter request through legacyOf() and querying the legacy column —
 * this keeps the API surface stable for the new composer while the
 * read switch is rolled out gradually.
 */

import { db } from '@/lib/db'
import type { Prisma, PostCategoryV2, PostAudience } from '@prisma/client'
import { legacyOf } from '@/lib/postCategory'
import { FLAGS } from '@/lib/flags'

export interface FeedFilter {
  neighborhoodId: string
  category?: PostCategoryV2 | null
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

  const categoryClause: Prisma.PostWhereInput = !f.category
    ? {}
    : FLAGS.USE_NEW_CATEGORY
      ? { newCategory: f.category }
      : { category: legacyOf(f.category) }

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

/**
 * Neighborhood Highlights — surfaces the most important recent posts
 * for a neighborhood. Stable enough to build trust, fresh enough to
 * stay relevant.
 *
 * Three layers, in render order:
 *
 *   1. Mod-pinned (live query, no cache, max 3) — moderator-curated.
 *   2. Auto-stable (top 2–3 by score, 24h cache) — the "doesn't shuffle
 *      within a day" layer, the one a first-time visitor reads first.
 *   3. Dynamic (next 3–5 by score, 30 min cache) — rotates gradually.
 *
 * Layers 2/3 are deduped against pinned and capped at 8 total.
 *
 * Eligibility (base filter): ACTIVE, last 14 days, category ∈ {
 * NEIGHBORHOOD_REPORTS, LOST_FOUND, SERVICES, EVENTS }, audience
 * matches the viewer, and engagement floor of 3 (likes+comments) so
 * zero-engagement noise can never reach the section.
 */

import { db } from '@/lib/db'
import { cached, cacheDelete } from '@/lib/cache'
import type { PostCategory, Prisma } from '@prisma/client'

const HIGHLIGHT_CATEGORIES: PostCategory[] = [
  'NEIGHBORHOOD_REPORTS',
  'LOST_FOUND',
  'SERVICES',
  'EVENTS',
]

const ELIGIBILITY_DAYS = 14
const MOD_PIN_TTL_DAYS = 14
const ENGAGEMENT_FLOOR = 3       // likes + comments must be ≥ this
const MAX_PINNED = 3             // max moderator pins active at once
const AUTO_STABLE_COUNT = 3      // top-by-score in 24h-cached layer
const DYNAMIC_COUNT = 5          // top-by-score in 30min-cached layer
const TOTAL_CAP = 8              // hard ceiling on items returned

const STABLE_TTL_MS  = 24 * 3600_000  // 24h — auto-stable layer
const DYNAMIC_TTL_MS = 30 * 60_000    // 30 min — dynamic layer

export interface HighlightItem {
  id: string
  title: string
  body: string
  category: PostCategory
  intent: 'OFFER' | 'REQUEST' | 'NORMAL'
  badge: 'pinned' | 'important' | 'popular' | null
  createdAt: string
  authorId: string
  authorName: string | null
  imageUrls: string[]
  reactionCount: number
  commentCount: number
}

export interface HighlightsBundle {
  items: HighlightItem[]
  generatedAt: string
}

type ViewerGender = 'MALE' | 'FEMALE' | 'UNSPECIFIED' | null

interface RawPost {
  id: string
  title: string
  body: string
  category: PostCategory
  intent: 'OFFER' | 'REQUEST' | 'NORMAL'
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
  audience: 'ALL' | 'WOMEN' | 'MEN'
  authorId: string
  author: { name: string | null; lastName: string | null } | null
  imageUrls: string[]
  createdAt: Date
  highlightPinnedAt: Date | null
  _count: { reactions: number; comments: number }
}

function audienceWhere(viewerGender: ViewerGender): Prisma.PostWhereInput {
  if (viewerGender === 'FEMALE') return {}                 // women see all
  if (viewerGender === 'MALE')   return { audience: { in: ['ALL', 'MEN'] } }
  return { audience: 'ALL' }
}

function recencyBoost(createdAt: Date): number {
  const ageMs = Date.now() - createdAt.getTime()
  if (ageMs < 24 * 3600_000)     return 5
  if (ageMs < 3 * 24 * 3600_000) return 3
  return 1
}

function scoreOf(p: RawPost): number {
  return p._count.reactions + p._count.comments * 2 + recencyBoost(p.createdAt)
}

function toItem(p: RawPost, badge: HighlightItem['badge']): HighlightItem {
  const first = p.author?.name?.trim() || ''
  const last = p.author?.lastName?.trim() || ''
  const authorName = [first, last].filter(Boolean).join(' ') || null
  return {
    id: p.id,
    // p.title may be empty for lightweight posts. Highlight consumers
    // (HighlightsSection card) need SOMETHING to render — they apply
    // their own fallback via buildDisplayTitle. Passing through as-is
    // keeps the contract honest: empty title means "use body excerpt".
    title: p.title,
    body: p.body,
    category: p.category,
    intent: p.intent,
    badge,
    createdAt: p.createdAt.toISOString(),
    authorId: p.authorId,
    authorName,
    imageUrls: p.imageUrls ?? [],
    reactionCount: p._count.reactions,
    commentCount: p._count.comments,
  }
}

function classify(p: RawPost): HighlightItem['badge'] {
  if (p.priority === 'HIGH' || p.priority === 'CRITICAL') return 'important'
  if (p.category === 'NEIGHBORHOOD_REPORTS' || p.category === 'LOST_FOUND') return 'important'
  if (p._count.reactions + p._count.comments >= 10) return 'popular'
  return null
}

const POST_SELECT = {
  id: true,
  title: true,
  body: true,
  category: true,
  intent: true,
  priority: true,
  audience: true,
  authorId: true,
  imageUrls: true,
  createdAt: true,
  highlightPinnedAt: true,
  author: { select: { name: true, lastName: true } },
  _count: { select: { reactions: true, comments: true } },
} as const

async function fetchModPinned(
  neighborhoodId: string,
  viewerGender: ViewerGender,
): Promise<RawPost[]> {
  const cutoff = new Date(Date.now() - MOD_PIN_TTL_DAYS * 24 * 3600_000)
  const rows = await db.post.findMany({
    where: {
      neighborhoodId,
      status: 'ACTIVE',
      highlightPinnedAt: { gte: cutoff },
      ...audienceWhere(viewerGender),
    },
    select: POST_SELECT,
    orderBy: { highlightPinnedAt: 'desc' },
    take: MAX_PINNED,
  })
  return rows as unknown as RawPost[]
}

async function fetchEligibleScored(
  neighborhoodId: string,
  viewerGender: ViewerGender,
  excludeIds: Set<string>,
  take: number,
): Promise<RawPost[]> {
  const since = new Date(Date.now() - ELIGIBILITY_DAYS * 24 * 3600_000)
  // Pull more than we need so we can apply the engagement floor and
  // dedupe in memory without a second query.
  const rows = await db.post.findMany({
    where: {
      neighborhoodId,
      status: 'ACTIVE',
      createdAt: { gte: since },
      category: { in: HIGHLIGHT_CATEGORIES },
      ...audienceWhere(viewerGender),
    },
    select: POST_SELECT,
    orderBy: { createdAt: 'desc' },
    take: 80,
  })

  const filtered = (rows as unknown as RawPost[])
    .filter((p) => !excludeIds.has(p.id))
    .filter((p) => p._count.reactions + p._count.comments >= ENGAGEMENT_FLOOR)

  filtered.sort((a, b) => scoreOf(b) - scoreOf(a))
  return filtered.slice(0, take)
}

/**
 * Public entry point. Returns the merged 3-layer bundle for a
 * neighborhood + viewer audience. Each layer is cached at its own TTL;
 * the merged result is computed per-call (cheap — three array reads).
 */
export async function getHighlights(
  neighborhoodId: string,
  viewerGender: ViewerGender,
): Promise<HighlightsBundle> {
  // Mod pins are always live — they're the moderator's intent and
  // need to reflect the latest action immediately.
  const pinned = await fetchModPinned(neighborhoodId, viewerGender)
  const pinnedIds = new Set(pinned.map((p) => p.id))

  // Audience cache key — male and female viewers see different sets.
  const audKey = viewerGender === 'FEMALE' ? 'F' : viewerGender === 'MALE' ? 'M' : 'A'

  const stable = await cached(
    `highlights:stable:${neighborhoodId}:${audKey}`,
    STABLE_TTL_MS,
    () => fetchEligibleScored(neighborhoodId, viewerGender, pinnedIds, AUTO_STABLE_COUNT),
  )
  const exclude = new Set<string>(pinnedIds)
  for (const p of stable) exclude.add(p.id)

  const dynamic = await cached(
    `highlights:dynamic:${neighborhoodId}:${audKey}`,
    DYNAMIC_TTL_MS,
    () => fetchEligibleScored(neighborhoodId, viewerGender, exclude, DYNAMIC_COUNT),
  )

  const items: HighlightItem[] = [
    ...pinned.map((p) => toItem(p, 'pinned')),
    ...stable.map((p) => toItem(p, classify(p))),
    ...dynamic.map((p) => toItem(p, classify(p))),
  ].slice(0, TOTAL_CAP)

  return { items, generatedAt: new Date().toISOString() }
}

/** Invalidate both auto layers for a neighborhood (called after mod pin/unpin). */
export function invalidateHighlights(neighborhoodId: string) {
  for (const aud of ['A', 'F', 'M']) {
    cacheDelete(`highlights:stable:${neighborhoodId}:${aud}`)
    cacheDelete(`highlights:dynamic:${neighborhoodId}:${aud}`)
  }
}

/** Count of currently-active mod pins in a neighborhood (for MAX_PINNED gate). */
export async function countActiveModPins(neighborhoodId: string): Promise<number> {
  const cutoff = new Date(Date.now() - MOD_PIN_TTL_DAYS * 24 * 3600_000)
  return db.post.count({
    where: {
      neighborhoodId,
      status: 'ACTIVE',
      highlightPinnedAt: { gte: cutoff },
    },
  })
}

export const HIGHLIGHT_CONFIG = {
  CATEGORIES: HIGHLIGHT_CATEGORIES,
  MAX_PINNED,
  TOTAL_CAP,
  ELIGIBILITY_DAYS,
  MOD_PIN_TTL_DAYS,
  ENGAGEMENT_FLOOR,
} as const

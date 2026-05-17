/**
 * Shared parsing + SQL/JS filter logic for the /directory pro
 * filter. Imported by both the SSR page and the GET /api/directory
 * route so URL params behave the same on first paint and on
 * client-side refetches.
 *
 * Filters that compose with Prisma's `where`:
 *   - minRating       → ratingAvg ≥ min AND ratingCount ≥ MIN_REVIEWS
 *   - verifiedOnly    → status IN (MOD_VERIFIED, CLAIMED_BY_OWNER)
 *   - hasPhotos       → imageUrls is not empty
 *
 * Filter applied in JS post-query:
 *   - openNow         → computePlacePill(...).tone === 'open'
 *
 * Sort options (Prisma orderBy):
 *   - top      → ratingAvg desc, ratingCount desc, createdAt desc
 *   - reviewed → ratingCount desc, ratingAvg desc
 *   - newest   → status desc, createdAt desc (legacy default)
 *   - alpha    → name asc
 */

import type { Prisma } from '@prisma/client'
import { PUBLIC_PLACE_STATUSES } from './statusBadge'
import { computePlacePill } from './openState'

/** Minimum review count required for a min-rating filter to apply
 *  to a place. Prevents one 5★ vote from gaming the "4.5+" view. */
export const MIN_REVIEWS_FOR_RATING_FILTER = 3

export type DirectorySort = 'top' | 'reviewed' | 'newest' | 'alpha'

export interface DirectoryFilters {
  /** Minimum ratingAvg (e.g. 4.5). 0 / undefined disables. */
  minRating: number | null
  /** True → show only places open right now. Applied JS-side. */
  openNow: boolean
  /** True → status must be MOD_VERIFIED or CLAIMED_BY_OWNER. */
  verifiedOnly: boolean
  /** True → place must have at least one image. */
  hasPhotos: boolean
  /** Sort order. Defaults to 'newest' when unset (preserves legacy). */
  sort: DirectorySort
}

const VALID_SORTS: DirectorySort[] = ['top', 'reviewed', 'newest', 'alpha']

/** Parse from URLSearchParams (API route) or a Record (SSR). Tolerates
 *  garbage input — any unknown value falls back to a safe default. */
export function parseDirectoryFilters(
  src:
    | URLSearchParams
    | { [k: string]: string | string[] | undefined }
    | null
    | undefined,
): DirectoryFilters {
  const get = (k: string): string | null => {
    if (!src) return null
    if (src instanceof URLSearchParams) return src.get(k)
    const v = (src as Record<string, string | string[] | undefined>)[k]
    if (Array.isArray(v)) return v[0] ?? null
    return typeof v === 'string' ? v : null
  }

  const minRatingRaw = get('minRating')
  const minRatingNum = minRatingRaw ? Number(minRatingRaw) : NaN
  const minRating =
    Number.isFinite(minRatingNum) && minRatingNum > 0 && minRatingNum <= 5
      ? minRatingNum
      : null

  const sortRaw = get('sort') as DirectorySort | null
  const sort: DirectorySort =
    sortRaw && VALID_SORTS.includes(sortRaw) ? sortRaw : 'newest'

  return {
    minRating,
    openNow: get('openNow') === '1',
    verifiedOnly: get('verifiedOnly') === '1',
    hasPhotos: get('hasPhotos') === '1',
    sort,
  }
}

/** Serialize back to a URLSearchParams-friendly object. Only emits
 *  keys for filters that are actually active, so the URL stays
 *  short ("?sort=top" rather than the full set). */
export function serializeDirectoryFilters(f: DirectoryFilters): Record<string, string> {
  const out: Record<string, string> = {}
  if (f.minRating !== null && f.minRating > 0) out.minRating = String(f.minRating)
  if (f.openNow) out.openNow = '1'
  if (f.verifiedOnly) out.verifiedOnly = '1'
  if (f.hasPhotos) out.hasPhotos = '1'
  if (f.sort !== 'newest') out.sort = f.sort
  return out
}

/** Returns true if any filter is non-default — used to decide
 *  whether to show the active-chips row vs the empty filter pill. */
export function hasActiveFilters(f: DirectoryFilters): boolean {
  return (
    (f.minRating !== null && f.minRating > 0) ||
    f.openNow ||
    f.verifiedOnly ||
    f.hasPhotos ||
    f.sort !== 'newest'
  )
}

/** Build the Prisma `where` extras for the filters that can run in
 *  SQL. openNow is applied JS-side after the query so it's omitted
 *  from this output. */
export function buildDirectoryWhere(
  f: DirectoryFilters,
): Prisma.PlaceListingWhereInput {
  const where: Prisma.PlaceListingWhereInput = {}

  if (f.minRating !== null && f.minRating > 0) {
    where.ratingAvg = { gte: f.minRating }
    where.ratingCount = { gte: MIN_REVIEWS_FOR_RATING_FILTER }
  }

  if (f.verifiedOnly) {
    // Tighter than PUBLIC_PLACE_STATUSES — exclude VISIBLE_UNVERIFIED.
    where.status = { in: ['MOD_VERIFIED', 'CLAIMED_BY_OWNER'] }
  } else {
    where.status = { in: PUBLIC_PLACE_STATUSES }
  }

  if (f.hasPhotos) {
    // Postgres String[] non-empty check.
    where.imageUrls = { isEmpty: false }
  }

  return where
}

/** Build the Prisma orderBy clauses for the chosen sort. */
export function buildDirectoryOrderBy(
  f: DirectoryFilters,
): Prisma.PlaceListingOrderByWithRelationInput[] {
  switch (f.sort) {
    case 'top':
      // Highest score first, with review count as the tiebreaker so
      // a 5.0 with 3 reviews loses to a 4.8 with 80. createdAt last
      // for deterministic ordering across equal scores.
      return [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { createdAt: 'desc' }]
    case 'reviewed':
      // Popularity sort — pure ratingCount, score as tiebreaker.
      return [{ ratingCount: 'desc' }, { ratingAvg: 'desc' }]
    case 'alpha':
      return [{ name: 'asc' }]
    case 'newest':
    default:
      // Legacy default — pin verified statuses to the top, then by
      // recency. Matches existing /directory and /api/directory
      // ordering so unfiltered behaviour is preserved.
      return [{ status: 'desc' }, { createdAt: 'desc' }]
  }
}

/** Minimal shape needed to compute open-now state. The /directory
 *  query already includes these fields on every row. */
interface OpenNowInput {
  openingHours: string | null
  manualStatus?: string | null
  manualStatusUntil?: Date | string | null
}

/** Apply the JS-side open-now filter. No-op when openNow is false. */
export function applyOpenNowFilter<T extends OpenNowInput>(
  rows: T[],
  f: DirectoryFilters,
  now: Date = new Date(),
): T[] {
  if (!f.openNow) return rows
  return rows.filter((r) => {
    const pill = computePlacePill(
      {
        openingHours: r.openingHours,
        manualStatus: r.manualStatus ?? null,
        manualStatusUntil:
          r.manualStatusUntil instanceof Date
            ? r.manualStatusUntil.toISOString()
            : (r.manualStatusUntil ?? null),
      },
      now,
    )
    return pill?.tone === 'open'
  })
}

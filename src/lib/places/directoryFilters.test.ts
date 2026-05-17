/**
 * Tests for the directory pro-filter parser + Prisma builder.
 *
 *   npx tsx --test src/lib/places/directoryFilters.test.ts
 *
 * Pins URL roundtrip + SQL composition so adding new filters
 * doesn't regress the existing ones.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDirectoryFilters,
  serializeDirectoryFilters,
  hasActiveFilters,
  buildDirectoryWhere,
  buildDirectoryOrderBy,
  applyOpenNowFilter,
  MIN_REVIEWS_FOR_RATING_FILTER,
} from './directoryFilters'

// ── parse / serialize roundtrip ─────────────────────────────────

test('parseDirectoryFilters — empty input → defaults', () => {
  const f = parseDirectoryFilters(null)
  assert.equal(f.minRating, null)
  assert.equal(f.openNow, false)
  assert.equal(f.verifiedOnly, false)
  assert.equal(f.hasPhotos, false)
  assert.equal(f.sort, 'newest')
})

test('parseDirectoryFilters — URLSearchParams', () => {
  const p = new URLSearchParams({
    minRating: '4.5',
    openNow: '1',
    verifiedOnly: '1',
    hasPhotos: '1',
    sort: 'top',
  })
  const f = parseDirectoryFilters(p)
  assert.equal(f.minRating, 4.5)
  assert.equal(f.openNow, true)
  assert.equal(f.verifiedOnly, true)
  assert.equal(f.hasPhotos, true)
  assert.equal(f.sort, 'top')
})

test('parseDirectoryFilters — rejects out-of-range / garbage', () => {
  const f = parseDirectoryFilters(
    new URLSearchParams({ minRating: '99', sort: 'garbage' }),
  )
  assert.equal(f.minRating, null) // 99 > 5, rejected
  assert.equal(f.sort, 'newest')   // garbage → default
})

test('serializeDirectoryFilters — omits defaults to keep URL short', () => {
  const out = serializeDirectoryFilters({
    minRating: null,
    openNow: false,
    verifiedOnly: false,
    hasPhotos: false,
    sort: 'newest',
  })
  assert.deepEqual(out, {})
})

test('serializeDirectoryFilters — emits only active keys', () => {
  const out = serializeDirectoryFilters({
    minRating: 4,
    openNow: true,
    verifiedOnly: false,
    hasPhotos: false,
    sort: 'top',
  })
  assert.deepEqual(out, { minRating: '4', openNow: '1', sort: 'top' })
})

test('parse ↔ serialize roundtrip', () => {
  const before = {
    minRating: 4.5,
    openNow: true,
    verifiedOnly: true,
    hasPhotos: false,
    sort: 'reviewed' as const,
  }
  const params = new URLSearchParams(serializeDirectoryFilters(before))
  const after = parseDirectoryFilters(params)
  assert.deepEqual(after, before)
})

// ── hasActiveFilters ────────────────────────────────────────────

test('hasActiveFilters — defaults are inactive', () => {
  assert.equal(
    hasActiveFilters({
      minRating: null,
      openNow: false,
      verifiedOnly: false,
      hasPhotos: false,
      sort: 'newest',
    }),
    false,
  )
})

test('hasActiveFilters — any non-default flips on', () => {
  const base = {
    minRating: null,
    openNow: false,
    verifiedOnly: false,
    hasPhotos: false,
    sort: 'newest' as const,
  }
  assert.equal(hasActiveFilters({ ...base, minRating: 3 }), true)
  assert.equal(hasActiveFilters({ ...base, openNow: true }), true)
  assert.equal(hasActiveFilters({ ...base, verifiedOnly: true }), true)
  assert.equal(hasActiveFilters({ ...base, hasPhotos: true }), true)
  assert.equal(hasActiveFilters({ ...base, sort: 'top' }), true)
})

// ── buildDirectoryWhere ─────────────────────────────────────────

test('buildDirectoryWhere — minRating also requires MIN_REVIEWS', () => {
  const w = buildDirectoryWhere({
    minRating: 4.5,
    openNow: false,
    verifiedOnly: false,
    hasPhotos: false,
    sort: 'newest',
  })
  assert.deepEqual(w.ratingAvg, { gte: 4.5 })
  assert.deepEqual(w.ratingCount, { gte: MIN_REVIEWS_FOR_RATING_FILTER })
})

test('buildDirectoryWhere — verifiedOnly tightens status set', () => {
  const w = buildDirectoryWhere({
    minRating: null,
    openNow: false,
    verifiedOnly: true,
    hasPhotos: false,
    sort: 'newest',
  })
  assert.deepEqual(w.status, { in: ['MOD_VERIFIED', 'CLAIMED_BY_OWNER'] })
})

test('buildDirectoryWhere — verifiedOnly off still constrains to PUBLIC_PLACE_STATUSES', () => {
  // Critical: the helper OWNS the status clause, so the caller's
  // spread in the route shouldn't drop visibility scoping.
  const w = buildDirectoryWhere({
    minRating: null,
    openNow: false,
    verifiedOnly: false,
    hasPhotos: false,
    sort: 'newest',
  })
  const status = w.status as { in: string[] }
  assert.ok(Array.isArray(status.in))
  // PENDING / REJECTED / REMOVED must not be in the list.
  assert.equal(status.in.includes('PENDING'), false)
  assert.equal(status.in.includes('REJECTED'), false)
})

test('buildDirectoryWhere — hasPhotos translates to non-empty array', () => {
  const w = buildDirectoryWhere({
    minRating: null,
    openNow: false,
    verifiedOnly: false,
    hasPhotos: true,
    sort: 'newest',
  })
  assert.deepEqual(w.imageUrls, { isEmpty: false })
})

// ── buildDirectoryOrderBy ───────────────────────────────────────

test('orderBy newest — legacy default preserved', () => {
  const o = buildDirectoryOrderBy({
    minRating: null,
    openNow: false,
    verifiedOnly: false,
    hasPhotos: false,
    sort: 'newest',
  })
  assert.deepEqual(o, [{ status: 'desc' }, { createdAt: 'desc' }])
})

test('orderBy top — score desc, count desc as tiebreaker', () => {
  const o = buildDirectoryOrderBy({
    minRating: null,
    openNow: false,
    verifiedOnly: false,
    hasPhotos: false,
    sort: 'top',
  })
  assert.equal(o[0].ratingAvg, 'desc')
  assert.equal(o[1].ratingCount, 'desc')
})

test('orderBy reviewed — count first', () => {
  const o = buildDirectoryOrderBy({
    minRating: null,
    openNow: false,
    verifiedOnly: false,
    hasPhotos: false,
    sort: 'reviewed',
  })
  assert.equal(o[0].ratingCount, 'desc')
})

test('orderBy alpha — name asc', () => {
  const o = buildDirectoryOrderBy({
    minRating: null,
    openNow: false,
    verifiedOnly: false,
    hasPhotos: false,
    sort: 'alpha',
  })
  assert.deepEqual(o, [{ name: 'asc' }])
})

// ── applyOpenNowFilter ──────────────────────────────────────────

test('applyOpenNowFilter — no-op when openNow=false', () => {
  const rows = [
    { openingHours: null, manualStatus: null, manualStatusUntil: null },
    { openingHours: 'يومياً 8 ص - 11 م', manualStatus: null, manualStatusUntil: null },
  ]
  const filtered = applyOpenNowFilter(rows, {
    minRating: null,
    openNow: false,
    verifiedOnly: false,
    hasPhotos: false,
    sort: 'newest',
  })
  assert.equal(filtered.length, 2)
})

test('applyOpenNowFilter — drops rows that are not "open" tone', () => {
  // A place with no opening hours can't have an "open" pill, so
  // every such row must drop when openNow is on.
  const rows = [
    { openingHours: null, manualStatus: null, manualStatusUntil: null },
    { openingHours: '', manualStatus: null, manualStatusUntil: null },
  ]
  const filtered = applyOpenNowFilter(rows, {
    minRating: null,
    openNow: true,
    verifiedOnly: false,
    hasPhotos: false,
    sort: 'newest',
  })
  assert.equal(filtered.length, 0)
})

test('applyOpenNowFilter — manualStatus blocks "open" tone', () => {
  // Even if opening hours say open right now, a manual override of
  // "تحت الصيانة" should keep this row out of open-now results.
  const rows = [
    {
      openingHours: '24 ساعة طوال الأسبوع',
      manualStatus: 'تحت الصيانة',
      manualStatusUntil: null,
    },
  ]
  const filtered = applyOpenNowFilter(rows, {
    minRating: null,
    openNow: true,
    verifiedOnly: false,
    hasPhotos: false,
    sort: 'newest',
  })
  assert.equal(filtered.length, 0)
})

test('applyOpenNowFilter — 24/7 place keeps in open-now', () => {
  const rows = [
    {
      openingHours: '24 ساعة طوال الأسبوع',
      manualStatus: null,
      manualStatusUntil: null,
    },
  ]
  const filtered = applyOpenNowFilter(rows, {
    minRating: null,
    openNow: true,
    verifiedOnly: false,
    hasPhotos: false,
    sort: 'newest',
  })
  assert.equal(filtered.length, 1)
})

/**
 * Tests for the directory helpers — normalization, validation,
 * trusted-reputation limits, role gate, status visibility.
 *
 *   npx tsx --test src/lib/places/places.test.ts
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePlaceName } from './normalize'
import {
  validatePlaceInput,
  placeLimitForUser,
  DIRECTORY_TRUSTED_REPUTATION,
  PLACE_LIMIT_NORMAL,
  PLACE_LIMIT_TRUSTED,
  isSafeMapUrl,
  isSafeHttpsUrl,
} from './validation'
import { isDirectoryModerator } from './isDirectoryModerator'
import { PUBLIC_PLACE_STATUSES } from './statusBadge'

// ── normalize ───────────────────────────────────────────────────────

test('normalize collapses Arabic letter variants', () => {
  // أ إ آ all map to ا; ى → ي; ة → ه
  const a = normalizePlaceName('صَيدليّة الأمل')
  const b = normalizePlaceName('صيدلية الامل')
  assert.equal(a, b)
})

test('normalize strips zero-width characters', () => {
  const a = normalizePlaceName('صيدلية​الأمل') // zero-width space inserted
  const b = normalizePlaceName('صيدلية الامل')
  // After stripping ZW and collapsing whitespace they should match.
  assert.equal(a.replace(/\s+/g, ''), b.replace(/\s+/g, ''))
})

test('normalize lowercases ASCII', () => {
  assert.equal(normalizePlaceName('Tamimi Market'), 'tamimi market')
})

test('normalize collapses whitespace and trims', () => {
  assert.equal(normalizePlaceName('  hello   world  '), 'hello world')
})

test('normalize returns empty string for whitespace-only input', () => {
  assert.equal(normalizePlaceName('   '), '')
  assert.equal(normalizePlaceName('​​'), '')
})

// ── validatePlaceInput ──────────────────────────────────────────────

const baseInput = {
  name: 'صيدلية الأمل',
  category: 'PHARMACY',
}

test('validate accepts a minimal valid payload', () => {
  const r = validatePlaceInput(baseInput)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.value.name, 'صيدلية الأمل')
    assert.equal(r.value.category, 'PHARMACY')
    assert.equal(r.value.phone, null)
  }
})

test('validate rejects too-short name', () => {
  const r = validatePlaceInput({ ...baseInput, name: 'ص' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.field, 'name')
})

test('validate rejects zero-width-only name (bypass attempt)', () => {
  // 8 zero-width chars; raw length looks ≥ 2 but normalized is empty.
  const r = validatePlaceInput({ ...baseInput, name: '​​​​​​​​' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.field, 'name')
})

test('validate rejects unknown category', () => {
  const r = validatePlaceInput({ ...baseInput, category: 'BANK' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.field, 'category')
})

test('validate rejects bad Saudi phone', () => {
  const r = validatePlaceInput({ ...baseInput, phone: '12345' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.field, 'phone')
})

test('validate accepts canonical Saudi phone', () => {
  const r = validatePlaceInput({ ...baseInput, phone: '0512345678' })
  assert.equal(r.ok, true)
})

test('validate rejects coordinates out of range', () => {
  const r = validatePlaceInput({ ...baseInput, latitude: 200, longitude: 0 })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.field, 'latitude')
})

test('validate rejects partial coordinates (only lat)', () => {
  const r = validatePlaceInput({ ...baseInput, latitude: 24.7 })
  assert.equal(r.ok, false)
})

test('validate accepts paired valid coordinates', () => {
  const r = validatePlaceInput({ ...baseInput, latitude: 24.7, longitude: 46.6 })
  assert.equal(r.ok, true)
})

test('validate rejects long description', () => {
  const r = validatePlaceInput({ ...baseInput, description: 'x'.repeat(600) })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.field, 'description')
})

test('validate computes nameNormalized', () => {
  const r = validatePlaceInput(baseInput)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.ok(r.value.nameNormalized.length > 0)
    assert.notEqual(r.value.nameNormalized, r.value.name) // diacritics + variants stripped
  }
})

// ── URL gates ───────────────────────────────────────────────────────

test('isSafeMapUrl allows maps.google.com', () => {
  assert.equal(isSafeMapUrl('https://maps.google.com/?q=24.7,46.6'), true)
})

test('isSafeMapUrl rejects http (non-https)', () => {
  assert.equal(isSafeMapUrl('http://maps.google.com/?q=24.7,46.6'), false)
})

test('isSafeMapUrl rejects unrelated host', () => {
  assert.equal(isSafeMapUrl('https://evil.example.com/maps'), false)
})

test('isSafeHttpsUrl accepts any https url', () => {
  assert.equal(isSafeHttpsUrl('https://example.com/store'), true)
})

test('isSafeHttpsUrl rejects http url', () => {
  assert.equal(isSafeHttpsUrl('http://example.com/'), false)
})

// ── Trusted reputation / limit ──────────────────────────────────────

test('placeLimitForUser uses trusted limit at threshold 150', () => {
  assert.equal(DIRECTORY_TRUSTED_REPUTATION, 150)
  assert.equal(placeLimitForUser(150), PLACE_LIMIT_TRUSTED)
  assert.equal(placeLimitForUser(149), PLACE_LIMIT_NORMAL)
  assert.equal(placeLimitForUser(0), PLACE_LIMIT_NORMAL)
})

test('PLACE_LIMIT constants match the spec (3 / 7)', () => {
  assert.equal(PLACE_LIMIT_NORMAL, 3)
  assert.equal(PLACE_LIMIT_TRUSTED, 7)
})

// ── Role gate ───────────────────────────────────────────────────────

test('isDirectoryModerator allows NEIGHBORHOOD_MOD / PLATFORM_MOD / SUPER_ADMIN', () => {
  assert.equal(isDirectoryModerator('NEIGHBORHOOD_MOD'), true)
  assert.equal(isDirectoryModerator('PLATFORM_MOD'),     true)
  assert.equal(isDirectoryModerator('SUPER_ADMIN'),      true)
})

test('isDirectoryModerator REJECTS COMPOUND_ADMIN (MVP rule)', () => {
  assert.equal(isDirectoryModerator('COMPOUND_ADMIN'), false)
})

test('isDirectoryModerator rejects RESIDENT / null / undefined', () => {
  assert.equal(isDirectoryModerator('RESIDENT'), false)
  assert.equal(isDirectoryModerator(null),       false)
  assert.equal(isDirectoryModerator(undefined),  false)
})

// ── Status visibility ──────────────────────────────────────────────

test('PUBLIC_PLACE_STATUSES excludes private statuses', () => {
  assert.ok(!PUBLIC_PLACE_STATUSES.includes('PENDING' as any))
  assert.ok(!PUBLIC_PLACE_STATUSES.includes('REJECTED' as any))
  assert.ok(!PUBLIC_PLACE_STATUSES.includes('REMOVED' as any))
})

test('PUBLIC_PLACE_STATUSES includes mod-verified + claimed + visible-unverified', () => {
  assert.ok(PUBLIC_PLACE_STATUSES.includes('VISIBLE_UNVERIFIED' as any))
  assert.ok(PUBLIC_PLACE_STATUSES.includes('MOD_VERIFIED' as any))
  assert.ok(PUBLIC_PLACE_STATUSES.includes('CLAIMED_BY_OWNER' as any))
})

test('PUBLIC_PLACE_STATUSES does NOT include COMMUNITY_VERIFIED (Phase 1.5)', () => {
  // The value isn't in the enum at all — this is a sanity check that
  // we didn't accidentally reintroduce it.
  assert.ok(!PUBLIC_PLACE_STATUSES.includes('COMMUNITY_VERIFIED' as any))
})

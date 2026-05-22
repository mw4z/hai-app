/**
 * Tests for pinned-item pure logic.
 *   node --import tsx --test src/lib/pinnedItems/pinnedItems.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  expiryFromDuration, isVisibleToResident, canManagePinned, canManageInNeighborhood,
} from './pinnedItems'

const NOW = new Date('2026-05-22T08:00:00Z')

test('duration → expiry', () => {
  assert.equal(expiryFromDuration('forever', NOW), null)
  assert.equal(expiryFromDuration('24h', NOW)!.toISOString(), '2026-05-23T08:00:00.000Z')
  assert.equal(expiryFromDuration('7d', NOW)!.getTime(), NOW.getTime() + 7 * 86400000)
  assert.equal(expiryFromDuration('30d', NOW)!.getTime(), NOW.getTime() + 30 * 86400000)
  // custom: future ok, past/invalid → null (treated as forever, not expired)
  assert.equal(expiryFromDuration('custom', NOW, '2026-06-01T00:00:00Z')!.toISOString(), '2026-06-01T00:00:00.000Z')
  assert.equal(expiryFromDuration('custom', NOW, '2020-01-01T00:00:00Z'), null)
  assert.equal(expiryFromDuration('custom', NOW, 'not-a-date'), null)
})

test('resident visibility: ACTIVE + not hidden + not expired only', () => {
  const base = { status: 'ACTIVE', hiddenAt: null as Date | null, expiresAt: null as Date | null }
  assert.equal(isVisibleToResident(base, NOW), true)                                   // forever active
  assert.equal(isVisibleToResident({ ...base, expiresAt: new Date('2027-01-01') }, NOW), true)  // future expiry
  assert.equal(isVisibleToResident({ ...base, expiresAt: new Date('2026-05-21T08:00:00Z') }, NOW), false) // past expiry
  assert.equal(isVisibleToResident({ ...base, hiddenAt: NOW }, NOW), false)            // hidden
  assert.equal(isVisibleToResident({ ...base, status: 'HIDDEN' }, NOW), false)
  assert.equal(isVisibleToResident({ ...base, status: 'EXPIRED' }, NOW), false)
  assert.equal(isVisibleToResident({ ...base, status: 'REMOVED' }, NOW), false)
})

test('manage permission: mods yes, residents no', () => {
  assert.equal(canManagePinned('NEIGHBORHOOD_MOD'), true)
  assert.equal(canManagePinned('PLATFORM_MOD'), true)
  assert.equal(canManagePinned('SUPER_ADMIN'), true)
  assert.equal(canManagePinned('RESIDENT'), false)
  assert.equal(canManagePinned(null), false)
})

test('neighborhood scope: NEIGHBORHOOD_MOD confined to own hood', () => {
  assert.equal(canManageInNeighborhood('NEIGHBORHOOD_MOD', 'n1', 'n1'), true)
  assert.equal(canManageInNeighborhood('NEIGHBORHOOD_MOD', 'n1', 'n2'), false)
  assert.equal(canManageInNeighborhood('NEIGHBORHOOD_MOD', null, 'n1'), false)
  // platform/super: any neighborhood
  assert.equal(canManageInNeighborhood('PLATFORM_MOD', 'n1', 'n2'), true)
  assert.equal(canManageInNeighborhood('SUPER_ADMIN', null, 'n2'), true)
  // residents: never
  assert.equal(canManageInNeighborhood('RESIDENT', 'n1', 'n1'), false)
})

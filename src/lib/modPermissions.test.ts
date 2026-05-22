/**
 * Access-control tests for mod capabilities.
 *   node --import tsx --test src/lib/modPermissions.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canVerifyProviders, canModerateUsers, canControlUser } from './modPermissions'

test('verification: PLATFORM_MOD + SUPER_ADMIN only (NEIGHBORHOOD_MOD barred — audit H-3)', () => {
  assert.equal(canVerifyProviders('SUPER_ADMIN'), true)
  assert.equal(canVerifyProviders('PLATFORM_MOD'), true)
  assert.equal(canVerifyProviders('NEIGHBORHOOD_MOD'), false)
  assert.equal(canVerifyProviders('RESIDENT'), false)
  assert.equal(canVerifyProviders(null), false)
})

test('user list: all mod roles, never residents', () => {
  assert.equal(canModerateUsers('NEIGHBORHOOD_MOD'), true)
  assert.equal(canModerateUsers('PLATFORM_MOD'), true)
  assert.equal(canModerateUsers('SUPER_ADMIN'), true)
  assert.equal(canModerateUsers('RESIDENT'), false)
  assert.equal(canModerateUsers(undefined), false)
})

test('block/stop: only SUPER_ADMIN may act on an admin/mod account', () => {
  // super controls anyone
  assert.equal(canControlUser('SUPER_ADMIN', 'PLATFORM_MOD'), true)
  assert.equal(canControlUser('SUPER_ADMIN', 'NEIGHBORHOOD_MOD'), true)
  assert.equal(canControlUser('SUPER_ADMIN', 'RESIDENT'), true)
  // mods control residents
  assert.equal(canControlUser('NEIGHBORHOOD_MOD', 'RESIDENT'), true)
  assert.equal(canControlUser('PLATFORM_MOD', 'RESIDENT'), true)
  // mods CANNOT control admins/mods
  assert.equal(canControlUser('NEIGHBORHOOD_MOD', 'NEIGHBORHOOD_MOD'), false)
  assert.equal(canControlUser('NEIGHBORHOOD_MOD', 'SUPER_ADMIN'), false)
  assert.equal(canControlUser('PLATFORM_MOD', 'PLATFORM_MOD'), false)
  assert.equal(canControlUser('PLATFORM_MOD', 'SUPER_ADMIN'), false)
  // residents can't moderate
  assert.equal(canControlUser('RESIDENT', 'RESIDENT'), false)
})

/**
 * Tests for the outside-neighborhood posting gate — the server-side
 * policy that lets a non-resident send ONLY a REQUEST in a tiny set of
 * categories, and blocks everything else even if the client is
 * manipulated to send it.
 *
 * Run:
 *   npx ts-node --test src/lib/posts/outsideGate.test.ts
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateOutsideRequest,
  OUTSIDE_MAX_PER_HOOD_PER_DAY,
  OUTSIDE_MAX_TOTAL_PER_DAY,
} from './outsideGate'

// ── Residents: posting rights unchanged ─────────────────────────────

test('resident can create a normal (non-request) post', () => {
  const r = evaluateOutsideRequest({ isOutside: false, intentInput: 'NORMAL', category: 'GENERAL' })
  assert.equal(r.ok, true)
})

test('resident can create a marketplace post', () => {
  const r = evaluateOutsideRequest({ isOutside: false, intentInput: 'OFFER', category: 'MARKETPLACE', marketplaceTypeInput: 'SELL' })
  assert.equal(r.ok, true)
})

test('resident can create a neighborhood report', () => {
  const r = evaluateOutsideRequest({ isOutside: false, category: 'NEIGHBORHOOD_REPORTS', priorityInput: 'HIGH' })
  assert.equal(r.ok, true)
})

// ── Outsiders: REQUEST-only ─────────────────────────────────────────

test('outside user CANNOT create a normal post', () => {
  const r = evaluateOutsideRequest({ isOutside: true, intentInput: 'NORMAL', category: 'GENERAL' })
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.code, 'OUTSIDE_REQUEST_ONLY')
})

test('outside user CANNOT create an OFFER post', () => {
  const r = evaluateOutsideRequest({ isOutside: true, intentInput: 'OFFER', category: 'SERVICES' })
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.code, 'OUTSIDE_REQUEST_ONLY')
})

test('outside user CAN create a REQUEST in GENERAL', () => {
  const r = evaluateOutsideRequest({ isOutside: true, intentInput: 'REQUEST', category: 'GENERAL' })
  assert.equal(r.ok, true)
})

test('outside user CAN create a REQUEST in SERVICES', () => {
  const r = evaluateOutsideRequest({ isOutside: true, intentInput: 'REQUEST', category: 'SERVICES' })
  assert.equal(r.ok, true)
})

test('outside user with no explicit intent is treated as REQUEST (allowed in GENERAL)', () => {
  const r = evaluateOutsideRequest({ isOutside: true, category: 'GENERAL' })
  assert.equal(r.ok, true)
})

// ── Outsiders: blocked categories ───────────────────────────────────

for (const category of [
  'MARKETPLACE', 'HOME_BUSINESSES', 'REAL_ESTATE', 'RIDES',
  'LOST_FOUND', 'NEIGHBORHOOD_REPORTS', 'EVENTS', 'COMPETITIONS',
]) {
  test(`outside user CANNOT create a REQUEST in ${category}`, () => {
    const r = evaluateOutsideRequest({ isOutside: true, intentInput: 'REQUEST', category })
    assert.equal(r.ok, false)
    assert.equal(r.ok === false && r.code, 'OUTSIDE_CATEGORY_BLOCKED')
  })
}

// ── Outsiders: blocked attributes ───────────────────────────────────

test('outside user CANNOT attach a marketplaceType', () => {
  const r = evaluateOutsideRequest({ isOutside: true, intentInput: 'REQUEST', category: 'GENERAL', marketplaceTypeInput: 'SELL' })
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.code, 'OUTSIDE_MARKETPLACE_BLOCKED')
})

test('outside user CANNOT raise priority to HIGH', () => {
  const r = evaluateOutsideRequest({ isOutside: true, intentInput: 'REQUEST', category: 'GENERAL', priorityInput: 'HIGH' })
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.code, 'OUTSIDE_PRIORITY_BLOCKED')
})

test('outside user CANNOT set CRITICAL priority', () => {
  const r = evaluateOutsideRequest({ isOutside: true, intentInput: 'REQUEST', category: 'GENERAL', priorityInput: 'CRITICAL' })
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.code, 'OUTSIDE_PRIORITY_BLOCKED')
})

// Manipulated client: a service OFFER disguised as an outside post is
// still rejected (intent gate fires before anything else).
test('manipulated outside SERVICES OFFER is rejected', () => {
  const r = evaluateOutsideRequest({ isOutside: true, intentInput: 'OFFER', category: 'SERVICES', marketplaceTypeInput: 'JOB', priorityInput: 'CRITICAL' })
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.code, 'OUTSIDE_REQUEST_ONLY')
})

// ── Rate-limit constants (the enforced caps live in the route; these
//    pin the documented values so they don't silently drift) ─────────

test('outside rate-limit caps are 2 per hood / 5 total per day', () => {
  assert.equal(OUTSIDE_MAX_PER_HOOD_PER_DAY, 2)
  assert.equal(OUTSIDE_MAX_TOTAL_PER_DAY, 5)
})

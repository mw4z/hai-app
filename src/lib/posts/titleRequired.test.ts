/**
 * Tests for isTitleRequired — the single source of truth for which
 * categories accept body-only posts vs which insist on a real title.
 *
 * Run:
 *   npx ts-node --test src/lib/posts/titleRequired.test.ts
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isTitleRequired } from './titleRequired'

// ── Required for commercial / structured posts ──────────────────────────────

test('MARKETPLACE/SELL requires a title', () => {
  assert.equal(isTitleRequired('MARKETPLACE', 'NORMAL', 'SELL'), true)
})
test('MARKETPLACE/BUY requires a title', () => {
  assert.equal(isTitleRequired('MARKETPLACE', 'REQUEST', 'BUY'), true)
})
test('MARKETPLACE/JOB requires a title', () => {
  assert.equal(isTitleRequired('MARKETPLACE', 'OFFER', 'JOB'), true)
})
test('HOME_BUSINESSES OFFER requires a title', () => {
  assert.equal(isTitleRequired('HOME_BUSINESSES', 'OFFER', null), true)
})
test('SERVICES OFFER requires a title', () => {
  assert.equal(isTitleRequired('SERVICES', 'OFFER', null), true)
})
test('REAL_ESTATE OFFER requires a title', () => {
  assert.equal(isTitleRequired('REAL_ESTATE', 'OFFER', null), true)
})
test('EVENTS requires a title', () => {
  assert.equal(isTitleRequired('EVENTS', 'NORMAL', null), true)
})
test('COMPETITIONS requires a title', () => {
  assert.equal(isTitleRequired('COMPETITIONS', 'NORMAL', null), true)
})

// ── Optional for lightweight / conversational posts ─────────────────────────

test('GENERAL allows body-only', () => {
  assert.equal(isTitleRequired('GENERAL', 'NORMAL', null), false)
})
test('NEIGHBORHOOD_REPORTS allows body-only', () => {
  assert.equal(isTitleRequired('NEIGHBORHOOD_REPORTS', 'NORMAL', null), false)
})
test('LOST_FOUND allows body-only', () => {
  assert.equal(isTitleRequired('LOST_FOUND', 'NORMAL', null), false)
})
test('SERVICES REQUEST allows body-only ("Ask for plumber")', () => {
  assert.equal(isTitleRequired('SERVICES', 'REQUEST', null), false)
})
test('REAL_ESTATE REQUEST allows body-only ("Looking for apartment")', () => {
  assert.equal(isTitleRequired('REAL_ESTATE', 'REQUEST', null), false)
})
test('HOME_BUSINESSES REQUEST allows body-only', () => {
  assert.equal(isTitleRequired('HOME_BUSINESSES', 'REQUEST', null), false)
})
test('RIDES allows body-only (handled by /rides/new anyway)', () => {
  assert.equal(isTitleRequired('RIDES', 'REQUEST', null), false)
})

// ── Edge cases ──────────────────────────────────────────────────────────────

test('Title-required for SERVICES depends on intent, not marketplaceType', () => {
  // OFFER → required regardless of marketplaceType value
  assert.equal(isTitleRequired('SERVICES', 'OFFER', null), true)
  assert.equal(isTitleRequired('SERVICES', 'OFFER', 'SELL'), true)
  // REQUEST → optional regardless
  assert.equal(isTitleRequired('SERVICES', 'REQUEST', null), false)
  assert.equal(isTitleRequired('SERVICES', 'REQUEST', 'BUY'), false)
})

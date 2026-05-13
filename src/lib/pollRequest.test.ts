/**
 * Tests for pollRequest validation + rate-limit policy. Run with:
 *   TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","esModuleInterop":true,"target":"ES2020","skipLibCheck":true}' \
 *     node --require ts-node/register --test src/lib/pollRequest.test.ts
 *
 * Mirrors the classify.test.ts pattern so it slots into the existing
 * test workflow.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validatePollRequest,
  pollRequestLimitFor,
  normalizeOption,
  isEffectivelyEmpty,
  POLL_REQUEST_LIMITS,
} from './pollRequest'

const goodOptions = ['نعم', 'لا']

// ── Title length ───────────────────────────────────────────────────────────

test('title 4 chars → title_too_short', () => {
  const r = validatePollRequest({ title: 'abcd', options: goodOptions })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'title_too_short')
})

test('title 5 chars → ok', () => {
  const r = validatePollRequest({ title: 'abcde', options: goodOptions })
  assert.equal(r.ok, true)
})

test('title 120 chars → ok', () => {
  const r = validatePollRequest({ title: 'a'.repeat(120), options: goodOptions })
  assert.equal(r.ok, true)
})

test('title 121 chars → title_too_long', () => {
  const r = validatePollRequest({ title: 'a'.repeat(121), options: goodOptions })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'title_too_long')
})

test('whitespace-only title → title_too_short', () => {
  const r = validatePollRequest({ title: '          ', options: goodOptions })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'title_too_short')
})

test('zero-width-only title → title_too_short', () => {
  const r = validatePollRequest({ title: '​​​​​​', options: goodOptions })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'title_too_short')
})

// ── Description length ─────────────────────────────────────────────────────

test('description 500 chars → ok', () => {
  const r = validatePollRequest({
    title: 'valid title',
    description: 'a'.repeat(500),
    options: goodOptions,
  })
  assert.equal(r.ok, true)
})

test('description 501 chars → description_too_long', () => {
  const r = validatePollRequest({
    title: 'valid title',
    description: 'a'.repeat(501),
    options: goodOptions,
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'description_too_long')
})

test('omitted description → ok with null', () => {
  const r = validatePollRequest({ title: 'valid title', options: goodOptions })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.value.description, null)
})

// ── Options count ──────────────────────────────────────────────────────────

test('1 option → options_count', () => {
  const r = validatePollRequest({ title: 'valid title', options: ['solo'] })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'options_count')
})

test('2 options → ok', () => {
  const r = validatePollRequest({ title: 'valid title', options: ['a', 'b'] })
  assert.equal(r.ok, true)
})

test('8 options → ok', () => {
  const r = validatePollRequest({
    title: 'valid title',
    options: ['1', '2', '3', '4', '5', '6', '7', '8'],
  })
  assert.equal(r.ok, true)
})

test('9 options → options_count', () => {
  const r = validatePollRequest({
    title: 'valid title',
    options: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'options_count')
})

test('non-array options → options_count', () => {
  const r = validatePollRequest({ title: 'valid title', options: 'not-array' as unknown })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'options_count')
})

// ── Per-option length ──────────────────────────────────────────────────────

test('option 80 chars → ok', () => {
  const r = validatePollRequest({
    title: 'valid title',
    options: ['a'.repeat(80), 'b'],
  })
  assert.equal(r.ok, true)
})

test('option 81 chars → option_too_long', () => {
  const r = validatePollRequest({
    title: 'valid title',
    options: ['a'.repeat(81), 'b'],
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'option_too_long')
})

// ── Blank / invisible options ─────────────────────────────────────────────

test('empty-string option → option_blank_or_invisible', () => {
  const r = validatePollRequest({ title: 'valid title', options: ['valid', ''] })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'option_blank_or_invisible')
})

test('whitespace-only option → option_blank_or_invisible', () => {
  const r = validatePollRequest({ title: 'valid title', options: ['valid', '   '] })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'option_blank_or_invisible')
})

test('zero-width-only option → option_blank_or_invisible', () => {
  const r = validatePollRequest({ title: 'valid title', options: ['valid', '​‌‍﻿'] })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'option_blank_or_invisible')
})

// ── Dedup ──────────────────────────────────────────────────────────────────

test('exact duplicate options → duplicate_options', () => {
  const r = validatePollRequest({ title: 'valid title', options: ['نعم', 'نعم'] })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'duplicate_options')
})

test('trailing-space duplicate → duplicate_options', () => {
  const r = validatePollRequest({ title: 'valid title', options: ['نعم', 'نعم '] })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'duplicate_options')
})

test('zero-width duplicate → duplicate_options', () => {
  const r = validatePollRequest({ title: 'valid title', options: ['نعم', 'نعم​'] })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'duplicate_options')
})

test('case-different duplicate → duplicate_options (latin)', () => {
  const r = validatePollRequest({ title: 'valid title', options: ['Yes', 'yes'] })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'duplicate_options')
})

test('genuinely-different options → ok', () => {
  const r = validatePollRequest({ title: 'valid title', options: ['نعم', 'Yes'] })
  assert.equal(r.ok, true)
})

// ── Reason length ──────────────────────────────────────────────────────────

test('reason 300 chars → ok', () => {
  const r = validatePollRequest({
    title: 'valid title',
    options: goodOptions,
    reason: 'a'.repeat(300),
  })
  assert.equal(r.ok, true)
})

test('reason 301 chars → reason_too_long', () => {
  const r = validatePollRequest({
    title: 'valid title',
    options: goodOptions,
    reason: 'a'.repeat(301),
  })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'reason_too_long')
})

test('omitted reason → ok with null', () => {
  const r = validatePollRequest({ title: 'valid title', options: goodOptions })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.value.reason, null)
})

// ── Normalization side-doors ───────────────────────────────────────────────

test('normalizeOption strips zero-width + collapses whitespace + lowercases', () => {
  assert.equal(normalizeOption('  Hello​  World  '), 'hello world')
})

test('isEffectivelyEmpty matches whitespace-only and zero-width-only', () => {
  assert.equal(isEffectivelyEmpty(''), true)
  assert.equal(isEffectivelyEmpty('   '), true)
  assert.equal(isEffectivelyEmpty('​‌‍'), true)
  assert.equal(isEffectivelyEmpty('x'), false)
})

// ── Rate-limit policy ──────────────────────────────────────────────────────

test('rate-limit policy: rep 0 → max 1', () => {
  const p = pollRequestLimitFor(0)
  assert.equal(p.max, 1)
  assert.equal(p.windowMs, POLL_REQUEST_LIMITS.rateWindowMs)
})

test('rate-limit policy: rep 149 → max 1', () => {
  assert.equal(pollRequestLimitFor(149).max, 1)
})

test('rate-limit policy: rep 150 → max 2', () => {
  assert.equal(pollRequestLimitFor(150).max, 2)
})

test('rate-limit policy: rep 999 → max 2', () => {
  assert.equal(pollRequestLimitFor(999).max, 2)
})

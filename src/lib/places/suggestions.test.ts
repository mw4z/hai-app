/**
 * Tests for the structured suggestion logic.
 *   node --import tsx --test src/lib/places/suggestions.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  contributionTypeForField, buildSuggestionDiffs, typesInDiffs, noteHasSpam,
} from './suggestions'

test('field → contribution type mapping (allowlist only)', () => {
  assert.equal(contributionTypeForField('name'), 'EDIT_PLACE')
  assert.equal(contributionTypeForField('description'), 'EDIT_PLACE')
  assert.equal(contributionTypeForField('phone'), 'ADD_CONTACT')
  assert.equal(contributionTypeForField('website'), 'ADD_CONTACT')
  assert.equal(contributionTypeForField('latitude'), 'FIX_LOCATION')
  assert.equal(contributionTypeForField('longitude'), 'FIX_LOCATION')
  // Non-suggestable / admin fields are never mapped.
  assert.equal(contributionTypeForField('status'), null)
  assert.equal(contributionTypeForField('claimedByUserId'), null)
  assert.equal(contributionTypeForField('providerStatus'), null)
  assert.equal(contributionTypeForField('imageUrls'), null)
})

test('only CHANGED allowlisted fields become diffs', () => {
  const current = { name: 'مخبز', phone: '0511111111', description: 'وصف', status: 'MOD_VERIFIED' }
  const proposed = {
    name: 'مخبز',                 // unchanged → dropped
    phone: '0512345678',          // changed → ADD_CONTACT
    description: 'وصف جديد',       // changed → EDIT_PLACE
    status: 'REMOVED',            // not suggestable → ignored
  }
  const diffs = buildSuggestionDiffs(current, proposed)
  const keys = diffs.map((d) => d.key).sort()
  assert.deepEqual(keys, ['description', 'phone'])
  assert.ok(!diffs.some((d) => d.key === 'status'))
  assert.deepEqual(typesInDiffs(diffs).sort(), ['ADD_CONTACT', 'EDIT_PLACE'])
})

test('no-op suggestion yields no diffs (→ no review, no reward)', () => {
  const current = { name: 'مخبز', phone: '0511111111' }
  assert.equal(buildSuggestionDiffs(current, { name: 'مخبز', phone: '0511111111' }).length, 0)
  // empty/blank proposed values are dropped too
  assert.equal(buildSuggestionDiffs(current, { description: '   ' }).length, 0)
})

test('location diffs use numeric tolerance', () => {
  const current = { latitude: 21.5, longitude: 39.2 }
  assert.equal(buildSuggestionDiffs(current, { latitude: 21.5, longitude: 39.2 }).length, 0)
  const moved = buildSuggestionDiffs(current, { latitude: 21.6, longitude: 39.2 })
  assert.equal(moved.length, 1)
  assert.equal(moved[0].contributionType, 'FIX_LOCATION')
})

test('note spam detection (links / handles / long digit runs)', () => {
  assert.equal(noteHasSpam('رقم صحيح: المكان انتقل'), false)
  assert.equal(noteHasSpam('زوروا https://spam.example'), true)
  assert.equal(noteHasSpam('تواصل على wa.me/12345'), true)
  assert.equal(noteHasSpam('حسابي @spammer'), true)
  assert.equal(noteHasSpam('اتصل 0512345678 الآن'), true)
})

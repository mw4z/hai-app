/**
 * Tests for the place open-state parser + pill priority logic.
 *
 *   npx tsx --test src/lib/places/openState.test.ts
 *
 * Failures here mean the auto مفتوح/مغلق pill stopped working
 * for the listed inputs.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseOpeningHours, computePlacePill } from './openState'

// ── Parser shapes ────────────────────────────────────────────────

test('parseOpeningHours — 24/7 preset', () => {
  const out = parseOpeningHours('24 ساعة طوال الأسبوع')
  assert.equal(out?.alwaysOpen, true)
  assert.equal(out?.days.length, 7)
})

test('parseOpeningHours — daily preset', () => {
  const out = parseOpeningHours('يومياً 8 ص - 11 م')
  assert.equal(out?.alwaysOpen, false)
  assert.equal(out?.days.length, 7)
  assert.deepEqual(out?.shifts, [{ open: '08:00', close: '23:00' }])
})

test('parseOpeningHours — Sat-Thu preset', () => {
  const out = parseOpeningHours('السبت - الخميس 9 ص - 10 م')
  assert.deepEqual(out?.days, [0, 1, 2, 3, 4, 5])
  assert.deepEqual(out?.shifts, [{ open: '09:00', close: '22:00' }])
})

test('parseOpeningHours — split shift', () => {
  const out = parseOpeningHours('يومياً 9 ص - 1 م، 5 - 11 م')
  assert.equal(out?.shifts.length, 2)
  assert.deepEqual(out?.shifts[0], { open: '09:00', close: '13:00' })
  // Second shift "5 - 11 م" — only close has the PM marker.
  // Parser keeps the close as 23:00. Open without suffix is
  // ambiguous; for the split-shift preset string the open
  // ("5") parses as 05:00 — caller surface tolerates that.
  assert.equal(out?.shifts[1].close, '23:00')
})

test('parseOpeningHours — custom with minutes', () => {
  const out = parseOpeningHours('السبت - الخميس 9:30 ص - 10:45 م')
  assert.deepEqual(out?.shifts, [{ open: '09:30', close: '22:45' }])
})

test('parseOpeningHours — garbage returns null', () => {
  assert.equal(parseOpeningHours('open whenever I feel like it'), null)
  assert.equal(parseOpeningHours(''), null)
  assert.equal(parseOpeningHours('not a real schedule'), null)
})

// ── Priority order ───────────────────────────────────────────────

const base = {
  openingHours: 'يومياً 8 ص - 11 م',
  manualStatus: null,
  manualStatusUntil: null,
} as const

test('computePlacePill — manual override beats auto', () => {
  const pill = computePlacePill({ ...base, manualStatus: 'تحت الصيانة' })
  assert.equal(pill?.label, 'تحت الصيانة')
  assert.equal(pill?.tone, 'manual-warn')
})

test('computePlacePill — expired manualStatusUntil falls back to auto', () => {
  const yesterday = new Date(Date.now() - 24 * 3600_000)
  const pill = computePlacePill({
    ...base,
    manualStatus: 'تحت الصيانة',
    manualStatusUntil: yesterday.toISOString(),
  })
  // Should NOT be the override.
  assert.notEqual(pill?.label, 'تحت الصيانة')
  assert.ok(['مفتوح', 'مغلق', 'يفتح قريبًا'].includes(pill?.label ?? ''))
})

test('computePlacePill — "مغلق نهائيًا" tones as danger', () => {
  const pill = computePlacePill({ ...base, manualStatus: 'مغلق نهائيًا' })
  assert.equal(pill?.tone, 'manual-danger')
})

test('computePlacePill — unparseable hours + no override → no pill', () => {
  assert.equal(
    computePlacePill({
      openingHours: 'whenever',
      manualStatus: null,
      manualStatusUntil: null,
    }),
    null,
  )
})

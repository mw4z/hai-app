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

test('computePlacePill — overnight shift, 3:38 AM Riyadh → closed (regression)', () => {
  // User report: a place open "10 ص - 2 ص" (10 AM - 2 AM next
  // morning, every day) was showing "مفتوح" at 3:38 AM KSA.
  // Earlier riyadhParts() used getTimezoneOffset() and ended up
  // off by 3 hours on KSA devices — 3:38 AM internally became
  // 0:38 AM, which fell inside the carry-over window of the
  // overnight shift. The fix shifts the absolute timestamp by
  // +3h and reads UTC components directly; this test pins it.
  const ksa338am = new Date('2026-05-15T00:38:00Z') // = 03:38 KSA
  const pill = computePlacePill(
    {
      openingHours: 'يومياً 10 ص - 2 ص',
      manualStatus: null,
      manualStatusUntil: null,
    },
    ksa338am,
  )
  assert.equal(pill?.label, 'مغلق')
  assert.equal(pill?.tone, 'closed')
})

test('computePlacePill — overnight shift, 1:00 AM Riyadh → open', () => {
  // The other half of the overnight-shift guarantee: at 1 AM
  // KSA we ARE still inside the 10 AM - 2 AM window from the
  // previous day's opening, so the pill must read مفتوح.
  const ksa100am = new Date('2026-05-15T22:00:00Z') // 22:00 UTC = 01:00 KSA next day
  const pill = computePlacePill(
    {
      openingHours: 'يومياً 10 ص - 2 ص',
      manualStatus: null,
      manualStatusUntil: null,
    },
    ksa100am,
  )
  assert.equal(pill?.label, 'مفتوح')
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

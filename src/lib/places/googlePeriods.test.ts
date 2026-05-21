/**
 * Tests for the Google-periods open/closed pill — the path that
 * handles shifts + per-day-varying hours the single-schedule string
 * can't represent.
 *
 *   npx tsx --test src/lib/places/googlePeriods.test.ts
 *
 * Riyadh is UTC+3 (no DST), so a UTC time T maps to Riyadh T+3.
 * Schedules below cover all 7 Google days (0=Sun…6=Sat) so the
 * assertions don't depend on which weekday the chosen date is.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computePlacePill } from './openState'

const base = { openingHours: null, manualStatus: null, manualStatusUntil: null }

/** A period openH→closeH on every day of the week. */
function everyDay(openH: number, closeH: number) {
  return Array.from({ length: 7 }, (_, d) => ({
    open: { day: d, hour: openH, minute: 0 },
    close: { day: d, hour: closeH, minute: 0 },
  }))
}

test('open during business hours', () => {
  const noonRiyadh = new Date('2026-05-23T09:00:00Z') // 12:00 Riyadh
  const pill = computePlacePill({ ...base, googlePeriods: everyDay(9, 17) }, noonRiyadh)
  assert.equal(pill?.tone, 'open')
})

test('closed outside business hours', () => {
  const elevenPmRiyadh = new Date('2026-05-23T20:00:00Z') // 23:00 Riyadh
  const pill = computePlacePill({ ...base, googlePeriods: everyDay(9, 17) }, elevenPmRiyadh)
  assert.equal(pill?.tone, 'closed')
})

test('opens soon (≤30 min before open)', () => {
  const elevenFortyFive = new Date('2026-05-23T08:45:00Z') // 11:45 Riyadh
  const pill = computePlacePill({ ...base, googlePeriods: everyDay(12, 20) }, elevenFortyFive)
  assert.equal(pill?.tone, 'soon')
})

test('24/7 — single open with no close is always open', () => {
  const pill = computePlacePill(
    { ...base, googlePeriods: [{ open: { day: 0, hour: 0, minute: 0 } }] },
    new Date('2026-05-23T20:00:00Z'),
  )
  assert.equal(pill?.tone, 'open')
})

test('multiple shifts in a day — open in the evening shift', () => {
  // Morning 9–13 + evening 17–23 every day. At 19:00 Riyadh → open
  // (inside the 2nd shift), even though the 1st shift is over.
  const sevenPm = new Date('2026-05-23T16:00:00Z') // 19:00 Riyadh
  const periods = [
    ...everyDay(9, 13),
    ...everyDay(17, 23),
  ]
  const pill = computePlacePill({ ...base, googlePeriods: periods }, sevenPm)
  assert.equal(pill?.tone, 'open')
})

test('multiple shifts — closed during the siesta gap', () => {
  const threePm = new Date('2026-05-23T12:00:00Z') // 15:00 Riyadh
  const periods = [...everyDay(9, 13), ...everyDay(17, 23)]
  const pill = computePlacePill({ ...base, googlePeriods: periods }, threePm)
  assert.equal(pill?.tone, 'closed')
})

test('user-entered openingHours overrides Google periods', () => {
  // openingHours present (24/7) wins over periods that say closed now.
  const elevenPm = new Date('2026-05-23T20:00:00Z') // 23:00 Riyadh
  const pill = computePlacePill(
    { ...base, openingHours: '24 ساعة طوال الأسبوع', googlePeriods: everyDay(9, 17) },
    elevenPm,
  )
  assert.equal(pill?.tone, 'open')
})

test('no hours and no periods → no pill', () => {
  const pill = computePlacePill({ ...base, googlePeriods: [] }, new Date())
  assert.equal(pill, null)
})

test('manual override beats periods', () => {
  const pill = computePlacePill(
    {
      openingHours: null,
      manualStatus: 'تحت الصيانة',
      manualStatusUntil: null,
      googlePeriods: everyDay(9, 17),
    },
    new Date('2026-05-23T09:00:00Z'),
  )
  assert.equal(pill?.label, 'تحت الصيانة')
})

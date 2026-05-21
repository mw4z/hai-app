/**
 * Tests for the grouped Google-hours display formatter.
 *   npx tsx --test src/lib/places/googleHoursDisplay.test.ts
 *
 * Google day: 0=Sun…6=Sat. Assertions use English for clean strings.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatGoogleHours } from './googleHoursDisplay'

const P = (gday: number, oh: number, ch: number) => ({
  open: { day: gday, hour: oh, minute: 0 },
  close: { day: gday, hour: ch, minute: 0 },
})

test('all days same → single grouped range', () => {
  const periods = Array.from({ length: 7 }, (_, g) => P(g, 9, 17))
  assert.deepEqual(formatGoogleHours(periods, 'en'), ['Sat - Fri: 9 AM - 5 PM'])
})

test('Friday differs → two grouped lines', () => {
  // Google Fri = 5; everything else 9–17, Friday 14–23.
  const periods = Array.from({ length: 7 }, (_, g) => (g === 5 ? P(5, 14, 23) : P(g, 9, 17)))
  assert.deepEqual(formatGoogleHours(periods, 'en'), [
    'Sat - Thu: 9 AM - 5 PM',
    'Fri: 2 PM - 11 PM',
  ])
})

test('multiple shifts in a day are joined', () => {
  const periods = Array.from({ length: 7 }, (_, g) => [P(g, 9, 13), P(g, 17, 23)]).flat()
  assert.deepEqual(formatGoogleHours(periods, 'en'), ['Sat - Fri: 9 AM - 1 PM, 5 PM - 11 PM'])
})

test('a closed day shows as Closed', () => {
  // All days 9–17 except Google Fri(5) has no period.
  const periods = Array.from({ length: 7 }, (_, g) => P(g, 9, 17)).filter(
    (p) => p.open.day !== 5,
  )
  assert.deepEqual(formatGoogleHours(periods, 'en'), [
    'Sat - Thu: 9 AM - 5 PM',
    'Fri: Closed',
  ])
})

test('24h most days + Friday partial (the reported bug)', () => {
  // ONE Google period: open Fri 1 PM → close Fri 2 AM, wrapping the
  // whole week. Sat–Thu are fully inside it (24h); Friday is partial.
  const periods = [{ open: { day: 5, hour: 13, minute: 0 }, close: { day: 5, hour: 2, minute: 0 } }]
  assert.deepEqual(formatGoogleHours(periods, 'en'), [
    'Sat - Thu: 24 hours',
    'Fri: 1 PM - 2 AM',
  ])
})

test('overnight on one day attributes to its open day', () => {
  // Open every day 10 PM → 2 AM next day. Each day's run starts 22:00.
  const periods = Array.from({ length: 7 }, (_, g) => ({
    open: { day: g, hour: 22, minute: 0 },
    close: { day: (g + 1) % 7, hour: 2, minute: 0 },
  }))
  assert.deepEqual(formatGoogleHours(periods, 'en'), ['Sat - Fri: 10 PM - 2 AM'])
})

test('24/7 → single open with no close', () => {
  assert.deepEqual(
    formatGoogleHours([{ open: { day: 0, hour: 0, minute: 0 } }], 'en'),
    ['Open 24 hours'],
  )
})

test('empty → no lines', () => {
  assert.deepEqual(formatGoogleHours([], 'en'), [])
  assert.deepEqual(formatGoogleHours(null, 'en'), [])
})

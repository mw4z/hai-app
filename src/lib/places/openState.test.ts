import { describe, test, expect } from 'vitest'
import { parseOpeningHours, computePlacePill } from './openState'

/**
 * Spot-checks of the parser and the priority logic. These run
 * via the project's existing vitest setup (npx vitest). Failures
 * mean the auto pill on the directory pages stopped working for
 * the listed inputs.
 */

describe('parseOpeningHours — picker output shapes', () => {
  test('24/7 preset', () => {
    const out = parseOpeningHours('24 ساعة طوال الأسبوع')
    expect(out?.alwaysOpen).toBe(true)
    expect(out?.days.length).toBe(7)
  })

  test('daily preset', () => {
    const out = parseOpeningHours('يومياً 8 ص - 11 م')
    expect(out?.alwaysOpen).toBe(false)
    expect(out?.days.length).toBe(7)
    expect(out?.shifts).toEqual([{ open: '08:00', close: '23:00' }])
  })

  test('sat-thu preset', () => {
    const out = parseOpeningHours('السبت - الخميس 9 ص - 10 م')
    expect(out?.days).toEqual([0, 1, 2, 3, 4, 5])
    expect(out?.shifts).toEqual([{ open: '09:00', close: '22:00' }])
  })

  test('split shift', () => {
    const out = parseOpeningHours('يومياً 9 ص - 1 م، 5 - 11 م')
    expect(out?.shifts.length).toBe(2)
    expect(out?.shifts[0]).toEqual({ open: '09:00', close: '13:00' })
    // Second shift has no "ص/م" on the open — defaults to 12h
    // interpretation; parser keeps it as "5 - 11 م" → both PM.
    expect(out?.shifts[1].close).toBe('23:00')
  })

  test('custom with minutes', () => {
    const out = parseOpeningHours('السبت - الخميس 9:30 ص - 10:45 م')
    expect(out?.shifts).toEqual([{ open: '09:30', close: '22:45' }])
  })

  test('garbage returns null', () => {
    expect(parseOpeningHours('open whenever I feel like it')).toBeNull()
    expect(parseOpeningHours('')).toBeNull()
    expect(parseOpeningHours('not a real schedule')).toBeNull()
  })
})

describe('computePlacePill — priority order', () => {
  const base = {
    openingHours: 'يومياً 8 ص - 11 م',
    manualStatus: null,
    manualStatusUntil: null,
  }

  test('manual override beats auto', () => {
    const pill = computePlacePill({
      ...base,
      manualStatus: 'تحت الصيانة',
    })
    expect(pill?.label).toBe('تحت الصيانة')
    expect(pill?.tone).toBe('manual-warn')
  })

  test('expired manualStatusUntil falls back to auto', () => {
    const yesterday = new Date(Date.now() - 24 * 3600_000)
    const pill = computePlacePill({
      ...base,
      manualStatus: 'تحت الصيانة',
      manualStatusUntil: yesterday.toISOString(),
    })
    // Should NOT be the override — should be one of the auto labels.
    expect(pill?.label).not.toBe('تحت الصيانة')
    expect(['مفتوح', 'مغلق', 'يفتح قريبًا']).toContain(pill?.label)
  })

  test('"مغلق نهائيًا" tones as danger (red)', () => {
    const pill = computePlacePill({
      ...base,
      manualStatus: 'مغلق نهائيًا',
    })
    expect(pill?.tone).toBe('manual-danger')
  })

  test('unparseable hours + no override → no pill', () => {
    expect(
      computePlacePill({
        openingHours: 'whenever',
        manualStatus: null,
        manualStatusUntil: null,
      }),
    ).toBeNull()
  })
})

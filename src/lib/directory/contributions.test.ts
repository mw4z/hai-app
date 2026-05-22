/**
 * Tests for the مساهماتي history helpers.
 *   node --import tsx --test src/lib/directory/contributions.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { statusBadge, matchesFilter, extractChangedFields, dailyCapEarned } from './contributions'

test('status badge: report-approved reads as actioned, others as approved', () => {
  assert.equal(statusBadge('CREATE_PLACE', 'PENDING_REVIEW'), 'pending')
  assert.equal(statusBadge('CREATE_PLACE', 'NEEDS_EDIT'), 'pending')
  assert.equal(statusBadge('CREATE_PLACE', 'APPROVED'), 'approved')
  assert.equal(statusBadge('EDIT_PLACE', 'APPROVED'), 'approved')
  assert.equal(statusBadge('REPORT_DUPLICATE', 'APPROVED'), 'actioned')
  assert.equal(statusBadge('REPORT_CLOSED', 'APPROVED'), 'actioned')
  assert.equal(statusBadge('CREATE_PLACE', 'REJECTED'), 'rejected')
  assert.equal(statusBadge('CREATE_PLACE', 'DUPLICATE'), 'duplicate')
})

test('filters partition by status and type', () => {
  const place = { type: 'CREATE_PLACE' as const, status: 'APPROVED' as const }
  const edit = { type: 'EDIT_PLACE' as const, status: 'PENDING_REVIEW' as const }
  const report = { type: 'REPORT_DUPLICATE' as const, status: 'APPROVED' as const }
  const rej = { type: 'ADD_CONTACT' as const, status: 'REJECTED' as const }

  assert.ok(matchesFilter(place, 'all') && matchesFilter(edit, 'all'))
  assert.ok(matchesFilter(edit, 'pending') && !matchesFilter(place, 'pending'))
  assert.ok(matchesFilter(place, 'approved') && !matchesFilter(edit, 'approved'))
  assert.ok(matchesFilter(rej, 'rejected') && !matchesFilter(place, 'rejected'))
  assert.ok(matchesFilter(place, 'places') && !matchesFilter(edit, 'places'))
  assert.ok(matchesFilter(edit, 'corrections') && matchesFilter(rej, 'corrections') && !matchesFilter(place, 'corrections'))
  assert.ok(matchesFilter(report, 'reports') && !matchesFilter(place, 'reports'))
})

test('changed-field summary: only allowlisted fields, coerced to strings', () => {
  const payload = {
    groupId: 'g1', note: 'تم النقل',
    fields: [
      { key: 'phone', oldValue: '0511111111', suggestedValue: '0512345678', contributionType: 'ADD_CONTACT' },
      { key: 'latitude', oldValue: 21.5, suggestedValue: 21.6, contributionType: 'FIX_LOCATION' },
      { key: 'status', oldValue: 'X', suggestedValue: 'REMOVED' }, // not allowlisted → dropped
    ],
  }
  const fields = extractChangedFields(payload)
  assert.equal(fields.length, 2)
  assert.deepEqual(fields.map((f) => f.key).sort(), ['latitude', 'phone'])
  assert.equal(fields[0].suggestedValue, '0512345678')
  assert.equal(typeof fields[1].suggestedValue, 'string') // 21.6 coerced
  // non-suggestion payloads → []
  assert.deepEqual(extractChangedFields(null), [])
  assert.deepEqual(extractChangedFields({}), [])
})

test('daily cap summary never overstates beyond the cap', () => {
  assert.equal(dailyCapEarned(9, 15), 9)
  assert.equal(dailyCapEarned(20, 15), 15) // clamped — never claims >15
  assert.equal(dailyCapEarned(-3, 15), 0)
})

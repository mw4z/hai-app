/**
 * Acceptance tests for Directory reputation rewards.
 *   node --import tsx --test src/lib/reputation/directoryRewards.test.ts
 *
 * Covers the spec's 8 criteria. The DB award (awardDirectoryReputation)
 * gathers facts and delegates the decision to decideAward, so testing
 * decideAward + pointsForContribution exercises the real award path.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pointsForContribution, cappedAward, decideAward, assessPlaceQuality,
  reportTypeToContributionType, DIRECTORY_DAILY_CAP,
} from './directoryRewards'

const fresh = (base: number) =>
  decideAward({ base, alreadyAwarded: false, priorSamePlaceType: false, dailyTotal: 0 })

// 1. approving CREATE_PLACE awards +5
test('CREATE_PLACE approved → +5', () => {
  const base = pointsForContribution('CREATE_PLACE', 'APPROVED', false)
  assert.equal(base, 5)
  assert.equal(fresh(base).award, 5)
})

// 2. approving high-quality CREATE_PLACE awards +8
test('high-quality CREATE_PLACE approved → +8', () => {
  const base = pointsForContribution('CREATE_PLACE', 'APPROVED', true)
  assert.equal(base, 8)
  assert.equal(fresh(base).award, 8)
})

// 3. approving EDIT_PLACE awards +2
test('EDIT_PLACE approved → +2', () => {
  assert.equal(pointsForContribution('EDIT_PLACE', 'APPROVED'), 2)
  assert.equal(pointsForContribution('FIX_LOCATION', 'APPROVED'), 3)
  assert.equal(pointsForContribution('ADD_CONTACT', 'APPROVED'), 2)
  assert.equal(pointsForContribution('ADD_PHOTO', 'APPROVED'), 2)
  assert.equal(pointsForContribution('REPORT_DUPLICATE', 'APPROVED'), 3)
  assert.equal(pointsForContribution('REPORT_CLOSED', 'APPROVED'), 3)
})

// 4. re-approving does not duplicate points
test('re-approve (event already exists) → 0', () => {
  const d = decideAward({ base: 5, alreadyAwarded: true, priorSamePlaceType: false, dailyTotal: 0 })
  assert.equal(d.award, 0)
  assert.equal(d.reason, 'already')
})

// 5. rejected contribution awards 0 points
test('REJECTED → 0', () => {
  assert.equal(pointsForContribution('CREATE_PLACE', 'REJECTED', true), 0)
  assert.equal(fresh(pointsForContribution('CREATE_PLACE', 'REJECTED')).award, 0)
})

// 6. duplicate contribution awards 0 points
test('DUPLICATE / NEEDS_EDIT / PENDING → 0', () => {
  assert.equal(pointsForContribution('CREATE_PLACE', 'DUPLICATE'), 0)
  assert.equal(pointsForContribution('CREATE_PLACE', 'NEEDS_EDIT'), 0)
  assert.equal(pointsForContribution('CREATE_PLACE', 'PENDING_REVIEW'), 0)
})

// 7. daily cap prevents earning more than 15 points
test('daily cap = 15', () => {
  assert.equal(DIRECTORY_DAILY_CAP, 15)
  assert.equal(cappedAward(0, 8), 8)
  assert.equal(cappedAward(14, 5), 1)   // only 1 left
  assert.equal(cappedAward(15, 5), 0)   // nothing left
  assert.equal(decideAward({ base: 5, alreadyAwarded: false, priorSamePlaceType: false, dailyTotal: 15 }).award, 0)
  assert.equal(decideAward({ base: 8, alreadyAwarded: false, priorSamePlaceType: false, dailyTotal: 10 }).award, 5)
})

// 8. same user cannot receive the same reward for the same source/place+type twice
test('same place + type already approved → 0', () => {
  const d = decideAward({ base: 5, alreadyAwarded: false, priorSamePlaceType: true, dailyTotal: 0 })
  assert.equal(d.award, 0)
  assert.equal(d.reason, 'dup_place_type')
})

// report-based rewards: only DUPLICATE / CLOSED map to a reward; generic /
// abuse / subjective reports earn nothing.
test('reportTypeToContributionType: only DUPLICATE + CLOSED are rewardable', () => {
  assert.equal(reportTypeToContributionType('DUPLICATE'), 'REPORT_DUPLICATE')
  assert.equal(reportTypeToContributionType('CLOSED'), 'REPORT_CLOSED')
  for (const generic of ['WRONG_INFO', 'WRONG_PHONE', 'WRONG_LOCATION', 'SPAM', 'OTHER']) {
    assert.equal(reportTypeToContributionType(generic), null)
  }
  // accepted duplicate/closed reports each award +3, once (cap/idempotency
  // covered by decideAward tests above — same engine path).
  assert.equal(fresh(pointsForContribution('REPORT_DUPLICATE', 'APPROVED')).award, 3)
  assert.equal(fresh(pointsForContribution('REPORT_CLOSED', 'APPROVED')).award, 3)
  // a rejected/dismissed report never reaches APPROVED → 0
  assert.equal(pointsForContribution('REPORT_DUPLICATE', 'REJECTED'), 0)
})

// quality heuristic (drives +8 vs +5)
test('assessPlaceQuality: rich place is high quality, sparse/duplicate is not', () => {
  assert.equal(assessPlaceQuality({
    name: 'مخبز الحي', category: 'RESTAURANT_CAFE', latitude: 21.5, longitude: 39.2,
    addressText: 'شارع الأمير', phone: '0512345678',
  }), true)
  assert.equal(assessPlaceQuality({ name: 'x', category: 'OTHER' }), false)
  assert.equal(assessPlaceQuality({
    name: 'مخبز', category: 'RESTAURANT_CAFE', latitude: 21.5, longitude: 39.2,
    addressText: 'شارع', phone: '0512345678', potentialDuplicate: true,
  }), false) // duplicates are never high-quality
})

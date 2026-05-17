/**
 * Regression suite for the weighted post-report system.
 *
 *   npx tsx --test src/lib/reputation-levels.test.ts
 *
 * The migration from count-based getReportThreshold() to weighted
 * getReportWeight + getAuthorHideThreshold must preserve two
 * invariants:
 *
 *   1. New-user posts are NOT harder to hide than today.
 *   2. Top-tier posts are NOT made trivially easier to hide.
 *
 * Reporter weights:
 *   new + active        → 1.0
 *   trusted (≥150 rep)  → 1.2
 *   top     (≥350 rep)  → 1.4
 *
 * Author hide thresholds (weighted):
 *   new=2.0  active=4.0  trusted=5.0  top=6.0
 *
 * Author remove thresholds = hide + 2.0.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getReportWeight,
  getAuthorHideThreshold,
  getAuthorRemoveThreshold,
} from './reputation-levels'

// Rep values that fall inside each tier (see getRepLevel in
// reputation-levels.ts — top ≥ 350, trusted ≥ 150, active ≥ 50,
// rest = new). Pinning to fixed numbers keeps the tests stable
// against rep-tier band edits.
const REP = {
  new: 0,
  active: 60,
  trusted: 200,
  top: 500,
} as const

function score(reporterReps: number[]): number {
  return reporterReps.reduce((acc, r) => acc + getReportWeight(r), 0)
}

function isHidden(authorRep: number, reporterReps: number[]): boolean {
  return score(reporterReps) >= getAuthorHideThreshold(authorRep)
}

function isRemoved(authorRep: number, reporterReps: number[]): boolean {
  return score(reporterReps) >= getAuthorRemoveThreshold(authorRep)
}

// ── Sanity ──────────────────────────────────────────────────────

test('getReportWeight — every tier weight is ≥ 1.0', () => {
  assert.ok(getReportWeight(REP.new)     >= 1.0)
  assert.ok(getReportWeight(REP.active)  >= 1.0)
  assert.ok(getReportWeight(REP.trusted) >= 1.0)
  assert.ok(getReportWeight(REP.top)     >= 1.0)
})

test('getReportWeight — top > trusted > new', () => {
  assert.ok(getReportWeight(REP.top)     >  getReportWeight(REP.trusted))
  assert.ok(getReportWeight(REP.trusted) >  getReportWeight(REP.new))
})

test('thresholds increase monotonically with author rep', () => {
  assert.ok(getAuthorHideThreshold(REP.new)     < getAuthorHideThreshold(REP.active))
  assert.ok(getAuthorHideThreshold(REP.active)  < getAuthorHideThreshold(REP.trusted))
  assert.ok(getAuthorHideThreshold(REP.trusted) < getAuthorHideThreshold(REP.top))
})

test('remove threshold sits above hide threshold for every tier', () => {
  for (const rep of Object.values(REP)) {
    assert.ok(getAuthorRemoveThreshold(rep) > getAuthorHideThreshold(rep))
  }
})

// ── Invariant 1: NEW-USER POSTS NOT HARDER TO HIDE ─────────────

test('NEW-user post hidden by 2 new reporters (matches legacy)', () => {
  assert.equal(isHidden(REP.new, [REP.new, REP.new]), true)
})

test('NEW-user post hidden by 2 active reporters (matches legacy)', () => {
  assert.equal(isHidden(REP.new, [REP.active, REP.active]), true)
})

test('NEW-user post hidden by 2 mixed reporters (any tier)', () => {
  assert.equal(isHidden(REP.new, [REP.new, REP.trusted]), true)
  assert.equal(isHidden(REP.new, [REP.new, REP.top]), true)
  assert.equal(isHidden(REP.new, [REP.trusted, REP.top]), true)
})

test('NEW-user post removed by 4 reporters at floor weight', () => {
  assert.equal(isRemoved(REP.new, [REP.new, REP.new, REP.new, REP.new]), true)
})

test('NEW-user post NOT hidden by 1 reporter, even top tier', () => {
  // Single reporter can never auto-hide. This is the structural
  // guarantee: max weight 1.4 < min author hide threshold 2.0.
  assert.equal(isHidden(REP.new, [REP.top]), false)
  assert.equal(isHidden(REP.new, [REP.trusted]), false)
  assert.equal(isHidden(REP.new, [REP.new]), false)
})

// ── Invariant 2: TOP-TIER POSTS NOT MADE TRIVIALLY EASY ────────

test('TOP-author post NOT hidden by 1 report of any tier', () => {
  assert.equal(isHidden(REP.top, [REP.top]), false)
  assert.equal(isHidden(REP.top, [REP.trusted]), false)
  assert.equal(isHidden(REP.top, [REP.new]), false)
})

test('TOP-author post NOT hidden by 4 trusted reporters (4.8 < 6.0)', () => {
  assert.equal(
    isHidden(REP.top, [REP.trusted, REP.trusted, REP.trusted, REP.trusted]),
    false,
  )
})

test('TOP-author post NOT hidden by 4 top reporters (5.6 < 6.0)', () => {
  // Even four highest-tier reporters can't hide a top-rep post —
  // confirms weighted system has not collapsed the protection.
  assert.equal(
    isHidden(REP.top, [REP.top, REP.top, REP.top, REP.top]),
    false,
  )
})

test('TOP-author post NOT hidden by 5 mixed-low reporters (5.0 < 6.0)', () => {
  // 5 × 1.0 = 5.0. Legacy threshold for top was 6 reports — we
  // still need 6 floor-weight reports to hide.
  assert.equal(
    isHidden(REP.top, [REP.new, REP.new, REP.new, REP.new, REP.new]),
    false,
  )
})

test('TOP-author post IS hidden by 5 trusted reporters (6.0 ≥ 6.0)', () => {
  // Trusted reporters reach 6.0 in 5 reports, vs 6 reports flat
  // in the legacy system. This is the intended loosening — high-
  // signal reporters should count more — and still requires real
  // distinct-user volume (≥5).
  assert.equal(
    isHidden(REP.top, [REP.trusted, REP.trusted, REP.trusted, REP.trusted, REP.trusted]),
    true,
  )
})

test('TOP-author post IS hidden by 6 floor reporters (legacy parity)', () => {
  // Six new-tier reporters = 6.0 = threshold. Same total count
  // as the legacy count-based system. No regression.
  assert.equal(
    isHidden(REP.top, [REP.new, REP.new, REP.new, REP.new, REP.new, REP.new]),
    true,
  )
})

// ── Middle tiers — spot-check ──────────────────────────────────

test('ACTIVE-author post hidden at 4 floor-weight reports (legacy parity)', () => {
  assert.equal(isHidden(REP.active, [REP.new, REP.new, REP.new, REP.new]), true)
  assert.equal(isHidden(REP.active, [REP.new, REP.new, REP.new]), false)
})

test('TRUSTED-author post hidden at 5 floor-weight reports (legacy parity)', () => {
  assert.equal(
    isHidden(REP.trusted, [REP.new, REP.new, REP.new, REP.new, REP.new]),
    true,
  )
  assert.equal(
    isHidden(REP.trusted, [REP.new, REP.new, REP.new, REP.new]),
    false,
  )
})

test('TRUSTED-author post hidden by 4 top reporters (5.6 ≥ 5.0)', () => {
  // Trusted-author threshold 5.0; four top reporters at 1.4 each
  // = 5.6. The weighted system credits high-tier reporters here.
  assert.equal(isHidden(REP.trusted, [REP.top, REP.top, REP.top, REP.top]), true)
})

// ── Single-reporter solo-hide is impossible at any author tier ─

test('one report — ANY tier reporter, ANY tier author — never auto-hides', () => {
  for (const author of Object.values(REP)) {
    for (const reporter of Object.values(REP)) {
      assert.equal(
        isHidden(author, [reporter]),
        false,
        `solo hide leaked: author=${author} reporter=${reporter}`,
      )
    }
  }
})

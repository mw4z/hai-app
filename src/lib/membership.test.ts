/**
 * Membership-state tests. Maps the spec's 8 scenarios onto the pure
 * permission helpers + the auth-gate decision (no DB / HTTP needed).
 *
 * Run: node --import tsx --test src/lib/membership.test.ts
 *
 * The DB-backed transitions themselves (GPS verify → VERIFIED, mod
 * approval → VERIFIED, claim cooldown enforcement) live in route
 * handlers and are covered here at the level of the rules they apply:
 * the resulting permissions per state + the cooldown constant.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canComment,
  canCreatePost,
  canCreateEmergencyAlert,
  canSetHighPriority,
  canVote,
  countsAsVerifiedResident,
  canCreateMarketplaceListing,
  canMakeCommercialOffer,
  directorySuggestionNeedsReview,
  membershipBadge,
  hasHomeClaim,
  HOME_CHANGE_COOLDOWN_MS,
  type Membership,
} from './membership'
import { requireUserReadyDecision } from './userReadyDecision'

const VERIFIED: Membership = 'VERIFIED_RESIDENT'
const CLAIMED: Membership = 'CLAIMED_RESIDENT'
const OUTSIDE: Membership = 'OUTSIDE'

const baseUser = (membership: Membership) => ({
  id: 'u', name: 'Ali', role: 'RESIDENT', addressVerified: membership === VERIFIED, membership,
})

// ── 1. Inside polygon → VERIFIED_RESIDENT has full rights ──────────────
test('VERIFIED_RESIDENT has full rights', () => {
  assert.equal(canComment(VERIFIED), true)
  assert.equal(canCreatePost(VERIFIED), true)
  assert.equal(canCreateMarketplaceListing(VERIFIED), true)
  assert.equal(canMakeCommercialOffer(VERIFIED), true)
  assert.equal(canCreateEmergencyAlert(VERIFIED), true)
  assert.equal(canSetHighPriority(VERIFIED), true)
  assert.equal(canVote(VERIFIED), true)
  assert.equal(countsAsVerifiedResident(VERIFIED), true)
  assert.equal(directorySuggestionNeedsReview(VERIFIED), false)
})

// ── 2. Outside claim → CLAIMED_RESIDENT can engage ─────────────────────
test('CLAIMED_RESIDENT can view/comment and pass the act gate', () => {
  assert.equal(hasHomeClaim(CLAIMED), true)
  assert.equal(canComment(CLAIMED), true)
  const r = requireUserReadyDecision(baseUser(CLAIMED))
  assert.equal(r.ok, true) // claimed users are NOT hard-blocked anymore
})

// ── 3. Claimed CANNOT create emergency / high-priority ─────────────────
test('CLAIMED_RESIDENT cannot create emergency or high/critical priority', () => {
  assert.equal(canCreateEmergencyAlert(CLAIMED), false)
  assert.equal(canSetHighPriority(CLAIMED), false)
  assert.equal(canVote(CLAIMED), false)
  assert.equal(countsAsVerifiedResident(CLAIMED), false)
})

// ── 4. Claimed CAN post normal content + requests, NOT marketplace/offer ─
test('CLAIMED_RESIDENT can post normal content + requests, not marketplace/offer', () => {
  assert.equal(canCreatePost(CLAIMED), true)
  assert.equal(canCreateMarketplaceListing(CLAIMED), false)
  assert.equal(canMakeCommercialOffer(CLAIMED), false)
  assert.equal(directorySuggestionNeedsReview(CLAIMED), true)
})

// ── 5. Outside visitor without claim is limited ────────────────────────
test('OUTSIDE visitor cannot comment/post and is blocked by the gate', () => {
  assert.equal(hasHomeClaim(OUTSIDE), false)
  assert.equal(canComment(OUTSIDE), false)
  assert.equal(canCreatePost(OUTSIDE), false)
  const r = requireUserReadyDecision(baseUser(OUTSIDE))
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'LOCATION_UNVERIFIED')
})

// ── 6 & 7. After GPS / mod upgrade, the user gains verified rights ─────
test('upgrade to VERIFIED grants the trust-sensitive actions', () => {
  // pre-upgrade (claimed) blocked, post-upgrade (verified) allowed
  assert.equal(canVote(CLAIMED), false)
  assert.equal(canVote(VERIFIED), true)
  assert.equal(canCreateEmergencyAlert(CLAIMED), false)
  assert.equal(canCreateEmergencyAlert(VERIFIED), true)
})

// ── 8. Home-change cooldown is 30 days ─────────────────────────────────
test('home-change cooldown is 30 days', () => {
  assert.equal(HOME_CHANGE_COOLDOWN_MS, 30 * 24 * 60 * 60 * 1000)
})

// ── Gate: VERIFIED passes, badges resolve ──────────────────────────────
test('gate: VERIFIED_RESIDENT passes', () => {
  assert.equal(requireUserReadyDecision(baseUser(VERIFIED)).ok, true)
})

test('membershipBadge returns localized labels per state', () => {
  assert.equal(membershipBadge(VERIFIED)?.ar, 'ساكن مؤكد')
  assert.equal(membershipBadge(CLAIMED)?.ar, 'بانتظار التحقق')
  assert.equal(membershipBadge(OUTSIDE)?.ar, 'من خارج الحي')
})

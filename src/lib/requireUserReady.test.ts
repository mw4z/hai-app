/**
 * Tests for the auth-gate decision layer + name validators.
 *
 * Run:
 *   npm run test:user-ready
 *
 * Two tiers of coverage:
 *
 *   1. Pure validators (nameValidation.ts) — string in, bool out.
 *      Covers Unicode normalization, zero-width strip, length bounds.
 *
 *   2. Decision layer (requireUserReadyDecision) — synthetic user
 *      snapshots in, discriminated-union decision out. Covers the
 *      gate logic without booting Prisma or the Next.js HTTP layer.
 *
 * The HTTP layer (toUserReadyResponse) is one switch statement — its
 * correctness is implied by the decision-layer + transport-mapping
 * unit tests below.
 *
 * Endpoint integration tests (incomplete user → 403 on /api/feed,
 * etc.) require a real DB fixture. Those are listed as TODOs at the
 * bottom of this file and should land in a follow-up that wires up a
 * sqlite test DB.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidFirstName, isValidLastName, normalizeName } from './nameValidation'
import { requireUserReadyDecision, toUserReadyResponse } from './userReadyDecision'

// ── normalizeName (Unicode-safe) ───────────────────────────────────

test('normalizeName trims leading/trailing whitespace', () => {
  assert.equal(normalizeName('  Ali  '), 'Ali')
})

test('normalizeName strips zero-width space (U+200B)', () => {
  assert.equal(normalizeName('A​B'), 'AB')
})

test('normalizeName strips zero-width non-joiner (U+200C)', () => {
  assert.equal(normalizeName('A‌B'), 'AB')
})

test('normalizeName strips zero-width joiner (U+200D)', () => {
  assert.equal(normalizeName('A‍B'), 'AB')
})

test('normalizeName strips BOM (U+FEFF)', () => {
  assert.equal(normalizeName('﻿Ali'), 'Ali')
})

test('normalizeName applies NFKC (fullwidth → halfwidth)', () => {
  assert.equal(normalizeName('Ａｌｉ'), 'Ali')
})

test('normalizeName returns empty string for non-string input', () => {
  assert.equal(normalizeName(null), '')
  assert.equal(normalizeName(undefined), '')
  assert.equal(normalizeName(42), '')
  assert.equal(normalizeName({}), '')
})

// ── isValidFirstName ──────────────────────────────────────────────

test('isValidFirstName rejects empty string', () => {
  assert.equal(isValidFirstName(''), false)
})

test('isValidFirstName rejects whitespace-only', () => {
  assert.equal(isValidFirstName('   '), false)
})

test('isValidFirstName rejects single character', () => {
  assert.equal(isValidFirstName('A'), false)
})

test('isValidFirstName rejects whitespace-padded single character', () => {
  assert.equal(isValidFirstName(' A '), false)
})

test('isValidFirstName rejects single char + zero-width-padded (Unicode bypass attempt)', () => {
  assert.equal(isValidFirstName('A​'), false)
  assert.equal(isValidFirstName('​A​'), false)
})

test('isValidFirstName accepts whitespace-padded valid name', () => {
  assert.equal(isValidFirstName('  Ali  '), true)
})

test('isValidFirstName accepts Arabic name', () => {
  assert.equal(isValidFirstName('مؤيد'), true)
})

test('isValidFirstName accepts 60-char name (boundary)', () => {
  assert.equal(isValidFirstName('a'.repeat(60)), true)
})

test('isValidFirstName rejects 61-char name (boundary)', () => {
  assert.equal(isValidFirstName('a'.repeat(61)), false)
})

test('isValidFirstName rejects null / undefined / non-string', () => {
  assert.equal(isValidFirstName(null), false)
  assert.equal(isValidFirstName(undefined), false)
  assert.equal(isValidFirstName(42), false)
})

// ── isValidLastName (optional, looser) ─────────────────────────────

test('isValidLastName accepts null / undefined', () => {
  assert.equal(isValidLastName(null), true)
  assert.equal(isValidLastName(undefined), true)
})

test('isValidLastName accepts empty / whitespace-only (normalized to null)', () => {
  assert.equal(isValidLastName(''), true)
  assert.equal(isValidLastName('   '), true)
})

test('isValidLastName accepts single-letter initial', () => {
  assert.equal(isValidLastName('Y'), true)
})

test('isValidLastName accepts 60-char (boundary)', () => {
  assert.equal(isValidLastName('a'.repeat(60)), true)
})

test('isValidLastName rejects 61-char (boundary)', () => {
  assert.equal(isValidLastName('a'.repeat(61)), false)
})

test('isValidLastName rejects non-string number', () => {
  assert.equal(isValidLastName(42), false)
})

// ── requireUserReadyDecision (pure decision layer, no I/O) ─────────

const completeUser = {
  id: 'u1',
  name: 'Ali',
  role: 'USER',
  addressVerified: true,
}

const incompleteUser = {
  ...completeUser,
  id: 'u2',
  name: '',
}

const whitespaceNameUser = {
  ...completeUser,
  id: 'u3',
  name: '   ',
}

const unverifiedUser = {
  ...completeUser,
  id: 'u4',
  addressVerified: false,
}

const superAdminComplete = {
  ...completeUser,
  id: 'admin1',
  role: 'SUPER_ADMIN',
  addressVerified: false, // location not verified — should still pass
}

const superAdminIncomplete = {
  ...superAdminComplete,
  id: 'admin2',
  name: '',
}

test('decision: complete + verified user → ok', () => {
  const r = requireUserReadyDecision(completeUser)
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.user.id, 'u1')
})

test('decision: null user → UNAUTHORIZED', () => {
  const r = requireUserReadyDecision(null)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'UNAUTHORIZED')
})

test('decision: empty name → PROFILE_INCOMPLETE', () => {
  const r = requireUserReadyDecision(incompleteUser)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'PROFILE_INCOMPLETE')
})

test('decision: whitespace-only name → PROFILE_INCOMPLETE', () => {
  const r = requireUserReadyDecision(whitespaceNameUser)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'PROFILE_INCOMPLETE')
})

test('decision: unverified user → LOCATION_UNVERIFIED', () => {
  const r = requireUserReadyDecision(unverifiedUser)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'LOCATION_UNVERIFIED')
})

test('decision: SUPER_ADMIN bypasses location verification', () => {
  const r = requireUserReadyDecision(superAdminComplete)
  assert.equal(r.ok, true)
})

test('decision: SUPER_ADMIN does NOT bypass profile completeness', () => {
  const r = requireUserReadyDecision(superAdminIncomplete)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'PROFILE_INCOMPLETE')
})

test('decision: requireProfile=false → unverified profile passes when location ok', () => {
  const r = requireUserReadyDecision(incompleteUser, { requireProfile: false, requireLocation: true })
  assert.equal(r.ok, true)
})

test('decision: requireLocation=false → unverified location passes when profile ok', () => {
  const r = requireUserReadyDecision(unverifiedUser, { requireProfile: true, requireLocation: false })
  assert.equal(r.ok, true)
})

test('decision: profile checked BEFORE location (order-of-errors)', () => {
  // User who fails BOTH gates should report PROFILE_INCOMPLETE
  // first — the user can't fix location until they have a name.
  const both = { ...completeUser, name: '', addressVerified: false }
  const r = requireUserReadyDecision(both)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'PROFILE_INCOMPLETE')
})

// ── toUserReadyResponse (transport mapping) ────────────────────────

test('transport: PROFILE_INCOMPLETE → 403 + profile_incomplete + /onboarding', async () => {
  const res = toUserReadyResponse('PROFILE_INCOMPLETE')
  assert.equal(res.status, 403)
  const body = await res.json()
  assert.equal(body.error, 'profile_incomplete')
  assert.equal(body.next, '/onboarding')
})

test('transport: LOCATION_UNVERIFIED → 403 + location_unverified + /onboarding', async () => {
  const res = toUserReadyResponse('LOCATION_UNVERIFIED')
  assert.equal(res.status, 403)
  const body = await res.json()
  assert.equal(body.error, 'location_unverified')
  assert.equal(body.next, '/onboarding')
})

test('transport: UNAUTHORIZED → 401 + unauthorized + /login', async () => {
  const res = toUserReadyResponse('UNAUTHORIZED')
  assert.equal(res.status, 401)
  const body = await res.json()
  assert.equal(body.error, 'unauthorized')
  assert.equal(body.next, '/login')
})

// ── Endpoint integration TODO ──────────────────────────────────────
//
// These need a Prisma test DB + Next.js route runner. Wiring them up
// is its own commit; for now the contract is documented:
//
//   ✗ GET  /api/feed (incomplete user) → 403 profile_incomplete
//   ✗ GET  /api/feed (unverified user) → 403 location_unverified
//   ✗ POST /api/posts (incomplete user) → 403 profile_incomplete
//   ✗ POST /api/threads (incomplete user) → 403 profile_incomplete
//   ✓ POST /api/posts (complete + verified) → 201
//   ✓ POST /api/auth/complete-profile (whitespace-only name) → 400 INVALID_NAME
//   ✓ POST /api/auth/complete-profile (zero-width-padded "A​") → 400 INVALID_NAME
//   ✓ DB rejects whitespace-only via User_name_format_check (raw INSERT test)

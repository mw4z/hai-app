/**
 * Tests for the profile-completeness validators (pure functions, no DB).
 *
 * Run:
 *   npm run test:user-ready
 *
 * Covers the application-layer rules that mirror the database CHECK
 * constraint added in 20260502_user_name_check:
 *   - first name: >= 2 chars after trim, <= 60 chars
 *   - last name:  optional; if present, >= 1 char after trim, <= 60
 *
 * The full integration cases (incomplete user blocked at /api/feed,
 * /api/posts, /api/threads, etc.) require a DB and live HTTP — they
 * are listed at the bottom of this file as a TODO and should land in
 * a follow-up that wires up a Prisma test DB.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isValidFirstName, isValidLastName } from './nameValidation'

// ── First name ─────────────────────────────────────────────────────

test('isValidFirstName rejects empty string', () => {
  assert.equal(isValidFirstName(''), false)
})

test('isValidFirstName rejects whitespace-only', () => {
  assert.equal(isValidFirstName('   '), false)
})

test('isValidFirstName rejects single-character', () => {
  assert.equal(isValidFirstName('A'), false)
})

test('isValidFirstName rejects whitespace-padded single character', () => {
  assert.equal(isValidFirstName(' A '), false)
})

test('isValidFirstName accepts well-formed name with leading/trailing spaces', () => {
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

test('isValidFirstName rejects null', () => {
  assert.equal(isValidFirstName(null), false)
})

test('isValidFirstName rejects undefined', () => {
  assert.equal(isValidFirstName(undefined), false)
})

test('isValidFirstName rejects non-string number', () => {
  assert.equal(isValidFirstName(42), false)
})

// ── Last name (optional, looser) ───────────────────────────────────

test('isValidLastName accepts null', () => {
  assert.equal(isValidLastName(null), true)
})

test('isValidLastName accepts undefined', () => {
  assert.equal(isValidLastName(undefined), true)
})

test('isValidLastName accepts empty string (will be normalized to null)', () => {
  assert.equal(isValidLastName(''), true)
})

test('isValidLastName accepts whitespace-only (will be normalized to null)', () => {
  assert.equal(isValidLastName('   '), true)
})

test('isValidLastName accepts single-character initial', () => {
  assert.equal(isValidLastName('Y'), true)
})

test('isValidLastName accepts well-formed name', () => {
  assert.equal(isValidLastName('Yar'), true)
})

test('isValidLastName accepts 60-char name (boundary)', () => {
  assert.equal(isValidLastName('a'.repeat(60)), true)
})

test('isValidLastName rejects 61-char name (boundary)', () => {
  assert.equal(isValidLastName('a'.repeat(61)), false)
})

test('isValidLastName rejects non-string number', () => {
  assert.equal(isValidLastName(42), false)
})

// ── Integration-test TODO ──────────────────────────────────────────
//
// The following require a DB + Next.js test client and are deferred to
// a follow-up commit that wires up Prisma against a sqlite test DB or
// equivalent. They're listed here so the contract is documented even
// while the runner isn't:
//
//   ✗ incomplete user GET /api/feed → 403 { error: 'profile_incomplete', next: '/onboarding' }
//   ✗ incomplete user POST /api/posts → 403 { error: 'profile_incomplete', next: '/onboarding' }
//   ✗ incomplete user POST /api/threads → 403 { error: 'profile_incomplete', next: '/onboarding' }
//   ✓ complete + verified user POST /api/posts → 201
//   ✓ complete + unverified user POST /api/posts → 403 { error: 'location_unverified', next: '/onboarding' }
//   ✓ SUPER_ADMIN with complete profile + unverified location → 200/201 (location bypass)
//   ✗ SUPER_ADMIN with incomplete profile → 403 + audit log line
//   ✗ DB rejects whitespace-only name via the User_name_format_check constraint

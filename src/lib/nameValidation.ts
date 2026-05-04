/**
 * Pure validators for User.name / User.lastName. Extracted into their
 * own module so unit tests can import them without dragging in the
 * Prisma client (db.ts throws when DATABASE_URL is unset, which is the
 * normal test environment).
 *
 * Rules — kept in sync with the DB CHECK constraints in
 * 20260502_user_name_check/migration.sql:
 *
 *   first name (required when present): normalize, trim, then 2 ≤ len ≤ 60
 *   last name  (optional):               normalize, trim, then 1 ≤ len ≤ 60
 *                                        (single-letter initials OK)
 *
 * Unicode-safe: NFKC normalization + zero-width-character strip.
 * Without these, a user could submit "A​" (single A + zero-width
 * space) — counts as 2 chars in JS, passes the .length check, but
 * renders as "A" in the UI and bypasses the DB CHECK once persisted.
 */

const FIRST_NAME_MIN = 2
const FIRST_NAME_MAX = 60
const LAST_NAME_MIN = 1
const LAST_NAME_MAX = 60

// Strip the four most common invisible characters that would otherwise
// pad the visible-length check: zero-width space, zero-width non-joiner,
// zero-width joiner, BOM. Anything else (combining marks, RTL marks,
// emoji modifiers) is left intact because those are sometimes legitimate
// parts of user-chosen names.
const ZERO_WIDTH_CHARS = /[​‌‍﻿]/g

/**
 * Normalize a user-submitted name string the way the validator + the
 * persisted column expect it: NFKC fold (unifies width / compatibility
 * forms), strip zero-width chars, then trim. Returns the empty string
 * for any non-string input. Pure; no I/O.
 */
export function normalizeName(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input.normalize('NFKC').replace(ZERO_WIDTH_CHARS, '').trim()
}

export function isValidFirstName(name: unknown): name is string {
  const normalized = normalizeName(name)
  return normalized.length >= FIRST_NAME_MIN && normalized.length <= FIRST_NAME_MAX
}

/**
 * Last name is optional. null / undefined / empty / whitespace-only is
 * treated as "not provided" — the API normalizes to NULL at write time.
 */
export function isValidLastName(name: unknown): boolean {
  if (name === null || name === undefined) return true
  if (typeof name !== 'string') return false
  const normalized = normalizeName(name)
  if (normalized.length === 0) return true
  return normalized.length >= LAST_NAME_MIN && normalized.length <= LAST_NAME_MAX
}

export const NAME_LIMITS = {
  FIRST_NAME_MIN,
  FIRST_NAME_MAX,
  LAST_NAME_MIN,
  LAST_NAME_MAX,
} as const

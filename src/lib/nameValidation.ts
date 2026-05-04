/**
 * Pure validators for User.name / User.lastName. Extracted into their
 * own module so unit tests can import them without dragging in the
 * Prisma client (which throws at load time when DATABASE_URL is unset
 * — fine for the app, blocks `node --test`).
 *
 * Rules — kept in sync with the DB CHECK constraints in
 * 20260502_user_name_check/migration.sql:
 *
 *   first name (required when present): trim, then 2 ≤ len ≤ 60
 *   last name  (optional):               trim, then 1 ≤ len ≤ 60
 *                                        (single-letter initials OK)
 *
 * Re-exported from requireUserReady.ts for compatibility.
 */

const FIRST_NAME_MIN = 2
const FIRST_NAME_MAX = 60
const LAST_NAME_MIN = 1
const LAST_NAME_MAX = 60

export function isValidFirstName(name: unknown): name is string {
  if (typeof name !== 'string') return false
  const trimmed = name.trim()
  return trimmed.length >= FIRST_NAME_MIN && trimmed.length <= FIRST_NAME_MAX
}

/**
 * Last name is optional. Empty / whitespace-only is treated as
 * "not provided" — the API normalizes those to null at write time.
 * Anything past trim must be 1..60 chars.
 */
export function isValidLastName(name: unknown): boolean {
  if (name === null || name === undefined) return true
  if (typeof name !== 'string') return false
  const trimmed = name.trim()
  if (trimmed.length === 0) return true
  return trimmed.length >= LAST_NAME_MIN && trimmed.length <= LAST_NAME_MAX
}

/** Constants exported so tests / API can reference the same numbers. */
export const NAME_LIMITS = {
  FIRST_NAME_MIN,
  FIRST_NAME_MAX,
  LAST_NAME_MIN,
  LAST_NAME_MAX,
} as const

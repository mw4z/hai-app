/**
 * Square admin-lock logic. The neighborhood carries three columns:
 *
 *   squareLockedAt    — when the lock window starts (can be FUTURE
 *                       for a scheduled lock).
 *   squareLockedUntil — when it auto-ends. Null = stays locked
 *                       until an admin manually unlocks.
 *   squareLockedById  — who set it (informational).
 *
 * Resolution is pure: given the three values + the current time,
 * we can answer "is Square currently locked for residents?". No
 * cron, no rolling state — the clock crossing a stored time IS
 * the activation / deactivation event.
 */

export interface SquareLockState {
  /** True when residents are currently blocked from posting. */
  isLocked: boolean
  /** When the active or scheduled lock starts. */
  lockedAt: Date | null
  /** When the lock auto-ends. Null = manual unlock only. */
  lockedUntil: Date | null
  /** Who set the lock. */
  lockedById: string | null
  /** True when the lock is in the FUTURE — set but not yet active. */
  isScheduled: boolean
}

export interface SquareLockRow {
  squareLockedAt: Date | null
  squareLockedUntil: Date | null
  squareLockedById: string | null
}

/** Pure: produce the user-facing state from raw row values + now. */
export function resolveSquareLock(row: SquareLockRow, now: Date = new Date()): SquareLockState {
  const { squareLockedAt, squareLockedUntil, squareLockedById } = row
  if (!squareLockedAt) {
    return {
      isLocked: false,
      lockedAt: null,
      lockedUntil: null,
      lockedById: null,
      isScheduled: false,
    }
  }
  const startedInPast = squareLockedAt.getTime() <= now.getTime()
  const stillRunning = !squareLockedUntil || squareLockedUntil.getTime() > now.getTime()
  return {
    isLocked: startedInPast && stillRunning,
    lockedAt: squareLockedAt,
    lockedUntil: squareLockedUntil,
    lockedById: squareLockedById,
    isScheduled: !startedInPast,
  }
}

/**
 * Admin role check for Square moderation actions (lock/unlock,
 * future broadcast moderation, etc). DECOUPLED from
 * isSquareAdminRole (which now returns true for all residents — the
 * GA gate). This is the actual moderation tier: mods + super admin.
 */
const SQUARE_MOD_ROLES = new Set(['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN'])
export function isSquareModRole(role: string | null | undefined): boolean {
  if (!role) return false
  return SQUARE_MOD_ROLES.has(role)
}

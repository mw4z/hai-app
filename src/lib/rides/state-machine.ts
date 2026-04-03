/**
 * Rides State Machine — deterministic transition rules.
 *
 * Every transition specifies:
 *   - allowed previous state
 *   - who can trigger it
 *   - what timestamp is set (write-once enforcement)
 */

export type RideStatus =
  | 'RIDE_OPEN'
  | 'RIDE_SELECTED'
  | 'RIDE_CONFIRMED'
  | 'RIDE_EN_ROUTE'
  | 'RIDE_ARRIVED'
  | 'RIDE_IN_PROGRESS'
  | 'RIDE_PENDING_COMPLETION'
  | 'RIDE_COMPLETED'
  | 'RIDE_CANCELLED'
  | 'RIDE_EXPIRED'
  | 'RIDE_DISPUTED'

export type ActorRole = 'requester' | 'driver' | 'system' | 'admin'

interface TransitionRule {
  to: RideStatus
  by: ActorRole[]
}

const TRANSITIONS: Record<RideStatus, TransitionRule[]> = {
  RIDE_OPEN: [
    { to: 'RIDE_SELECTED',  by: ['requester'] },
    { to: 'RIDE_CANCELLED', by: ['requester'] },
    { to: 'RIDE_EXPIRED',   by: ['system'] },
  ],
  RIDE_SELECTED: [
    { to: 'RIDE_CONFIRMED', by: ['driver'] },
    { to: 'RIDE_OPEN',      by: ['system'] },       // timeout reopen
    { to: 'RIDE_CANCELLED', by: ['requester'] },
  ],
  RIDE_CONFIRMED: [
    { to: 'RIDE_EN_ROUTE',  by: ['driver'] },
    { to: 'RIDE_CANCELLED', by: ['requester', 'driver', 'system'] },
  ],
  RIDE_EN_ROUTE: [
    { to: 'RIDE_ARRIVED',   by: ['driver'] },
    { to: 'RIDE_CANCELLED', by: ['requester', 'driver', 'system'] },
  ],
  RIDE_ARRIVED: [
    { to: 'RIDE_IN_PROGRESS', by: ['driver'] },
    { to: 'RIDE_CANCELLED',   by: ['requester', 'driver', 'system'] },
  ],
  RIDE_IN_PROGRESS: [
    { to: 'RIDE_PENDING_COMPLETION', by: ['driver'] },
    { to: 'RIDE_DISPUTED',          by: ['requester', 'driver', 'system'] },
    { to: 'RIDE_CANCELLED',         by: ['requester', 'driver'] },
  ],
  RIDE_PENDING_COMPLETION: [
    { to: 'RIDE_COMPLETED',  by: ['requester', 'system'] },
    { to: 'RIDE_DISPUTED',   by: ['requester', 'driver'] },
    { to: 'RIDE_CANCELLED',  by: ['requester', 'driver'] },
  ],
  RIDE_COMPLETED: [
    // Auto-close dispute grace: 24hr window for AUTO_CLOSED trips
    { to: 'RIDE_DISPUTED', by: ['requester', 'driver'] },
  ],
  RIDE_CANCELLED:  [],  // terminal
  RIDE_EXPIRED:    [],  // terminal
  RIDE_DISPUTED: [
    { to: 'RIDE_COMPLETED', by: ['admin'] },
    { to: 'RIDE_CANCELLED', by: ['admin'] },
  ],
}

export interface TransitionResult {
  valid: boolean
  error?: string
  errorCode?: string
}

/**
 * Validate whether a transition is allowed.
 */
export function canTransition(
  current: RideStatus,
  target: RideStatus,
  actor: ActorRole,
): TransitionResult {
  const rules = TRANSITIONS[current]
  if (!rules || rules.length === 0) {
    return { valid: false, error: `Status "${current}" is terminal`, errorCode: 'INVALID_TRANSITION' }
  }

  const match = rules.find(r => r.to === target)
  if (!match) {
    return { valid: false, error: `Transition "${current}" → "${target}" not defined`, errorCode: 'INVALID_TRANSITION' }
  }

  if (!match.by.includes(actor)) {
    return { valid: false, error: `Actor "${actor}" cannot trigger "${current}" → "${target}"`, errorCode: 'NOT_PARTICIPANT' }
  }

  return { valid: true }
}

/**
 * Determine the actor role of a user relative to a ride.
 */
export function getActorRole(
  userId: string,
  requesterId: string,
  driverId: string | null,
  userRole?: string,
): ActorRole {
  // Participant roles take priority over admin — an admin who is also
  // the driver or requester should act as driver/requester, not admin.
  if (userId === requesterId) return 'requester'
  if (driverId && userId === driverId) return 'driver'
  if (['SUPER_ADMIN', 'PLATFORM_MOD'].includes(userRole || '')) return 'admin'
  return 'requester' // will fail permission check
}

/**
 * Cancellation penalty based on the state at time of cancel.
 */
export function getCancelPenalty(statusAtCancel: RideStatus): number {
  switch (statusAtCancel) {
    case 'RIDE_OPEN':
    case 'RIDE_SELECTED':
      return 0
    case 'RIDE_CONFIRMED':
    case 'RIDE_EN_ROUTE':
      return -5
    case 'RIDE_ARRIVED':
      return -10
    case 'RIDE_IN_PROGRESS':
    case 'RIDE_PENDING_COMPLETION':
      return -15
    default:
      return 0
  }
}

/**
 * Completion reputation rewards by mode.
 */
export function getCompletionRewards(mode: 'REQUESTER_CONFIRMED' | 'AUTO_CLOSED' | 'DISPUTE_RESOLVED'): { driverRep: number; requesterRep: number; ratingWeight: number } {
  switch (mode) {
    case 'REQUESTER_CONFIRMED':
      return { driverRep: 25, requesterRep: 5, ratingWeight: 1.0 }
    case 'AUTO_CLOSED':
      return { driverRep: 15, requesterRep: 0, ratingWeight: 0.7 }
    case 'DISPUTE_RESOLVED':
      return { driverRep: 10, requesterRep: 0, ratingWeight: 0.5 }
  }
}

/**
 * Rating window in hours by completion mode.
 */
export function getRatingWindowHours(mode: string | null): number {
  switch (mode) {
    case 'REQUESTER_CONFIRMED': return 72
    case 'AUTO_CLOSED': return 48
    default: return 48 // dispute-resolved
  }
}

/**
 * States where ride chat is allowed.
 */
export const CHAT_ALLOWED_STATES: RideStatus[] = [
  'RIDE_CONFIRMED',
  'RIDE_EN_ROUTE',
  'RIDE_ARRIVED',
  'RIDE_IN_PROGRESS',
  'RIDE_PENDING_COMPLETION',
]

/**
 * States where the ride is considered "active" (not terminal).
 */
export const ACTIVE_STATES: RideStatus[] = [
  'RIDE_OPEN',
  'RIDE_SELECTED',
  'RIDE_CONFIRMED',
  'RIDE_EN_ROUTE',
  'RIDE_ARRIVED',
  'RIDE_IN_PROGRESS',
  'RIDE_PENDING_COMPLETION',
]

/**
 * States where exact coordinates are revealed to the driver.
 */
export const COORDS_VISIBLE_STATES: RideStatus[] = [
  'RIDE_CONFIRMED',
  'RIDE_EN_ROUTE',
  'RIDE_ARRIVED',
  'RIDE_IN_PROGRESS',
  'RIDE_PENDING_COMPLETION',
  'RIDE_COMPLETED',
]

/**
 * Default stale trip timeout in ms. Structured for future duration-awareness.
 * In V2, this can be replaced with: max(3hr, estimatedDuration * 3)
 */
export function getStaleInProgressTimeout(_estimatedDurationMin?: number): number {
  // V1: fixed 3 hours. V2: make duration-aware via the parameter.
  const BASE_TIMEOUT_MS = 3 * 60 * 60 * 1000
  return BASE_TIMEOUT_MS
}

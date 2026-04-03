/**
 * Centralized rules for private thread eligibility.
 * Used by both frontend (PostCard) and backend (thread creation API).
 */

const THREADABLE_CATEGORIES = new Set([
  'SERVICES',
  'LOOKING_FOR',
  'RIDE_REQUEST',
  'MARKETPLACE',
  'FOOD_HOME',
  'REAL_ESTATE',
])

/** Returns true if this post category allows private threads */
export function canStartPrivateThread(category: string): boolean {
  return THREADABLE_CATEGORIES.has(category)
}

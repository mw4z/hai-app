/**
 * Centralized rules for private thread eligibility.
 * Used by both frontend (PostCard) and backend (thread creation API).
 */

// PostCategory values that allow private threads.
const THREADABLE_CATEGORIES = new Set([
  'SERVICES',
  'RIDES',
  'MARKETPLACE',
  'HOME_BUSINESSES',
  'REAL_ESTATE',
])

/** Returns true if this post category allows private threads */
export function canStartPrivateThread(category: string): boolean {
  return THREADABLE_CATEGORIES.has(category)
}

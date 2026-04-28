/**
 * Centralized rules for private thread eligibility.
 * Used by both frontend (PostCard) and backend (thread creation API).
 */

// v2 PostCategoryV2 values. Callers pass the post's effective category
// (via readCategory or the v2 column directly) so legacy values never
// reach this set. The "request"-style buckets fold in via SERVICES /
// RIDES, which already cover the legacy LOOKING_FOR / RIDE_REQUEST
// threading semantics.
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

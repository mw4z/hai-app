/**
 * Post auto-expiry system.
 * Each category has a free visibility duration.
 * After expiry, posts are archived (not deleted).
 * Posts with active threads or high engagement get extended.
 */

// Free durations in hours per v2 category. Callers pass the post's v2
// category (post.newCategory or readCategory(post)) so legacy values
// never reach this map.
const EXPIRY_HOURS: Record<string, number> = {
  LOST_FOUND:           168,   // 7 days
  MARKETPLACE:          72,    // 3 days
  HOME_BUSINESSES:      24,
  SERVICES:             24,    // paid extension later
  REAL_ESTATE:          24,    // paid extension later
  NEIGHBORHOOD_REPORTS: 168,   // 7 days
  EVENTS:               168,   // 7 days
  COMPETITIONS:         168,   // 7 days
  RIDES:                12,
  GENERAL:              72,    // 3 days
}

const DEFAULT_HOURS = 72 // 3 days fallback

// High engagement threshold — posts with this many comments get 2x duration
const HIGH_ENGAGEMENT_COMMENTS = 5

/**
 * Get expiry date for a post based on its v2 category and creation time.
 * Pass post.newCategory (the v2 column) — legacy values are not
 * supported here and will fall through to DEFAULT_HOURS.
 */
export function getPostExpiryDate(category: string | null | undefined, createdAt: Date): Date {
  const hours = (category && EXPIRY_HOURS[category]) || DEFAULT_HOURS
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000)
}

/**
 * Check if a post should be archived.
 * Returns true if expired and no active threads or high engagement.
 *
 * Reads post.newCategory (the v2 column) for the bucket lookup; falls
 * back to DEFAULT_HOURS for any row whose newCategory is null.
 */
export function shouldArchivePost(post: {
  newCategory?: string | null
  createdAt: Date
  activeThreadId?: string | null
  isPinned?: boolean
  _count?: { comments: number }
}): boolean {
  // Pinned posts never expire
  if (post.isPinned) return false

  // Posts with active coordination threads stay visible
  if (post.activeThreadId) return false

  const hours = (post.newCategory && EXPIRY_HOURS[post.newCategory]) || DEFAULT_HOURS

  // High engagement posts get 2x duration
  const commentCount = post._count?.comments || 0
  const multiplier = commentCount >= HIGH_ENGAGEMENT_COMMENTS ? 2 : 1

  const expiryMs = hours * multiplier * 60 * 60 * 1000
  const expiryDate = new Date(post.createdAt.getTime() + expiryMs)

  return Date.now() > expiryDate.getTime()
}

/**
 * Get remaining time for a post in human-readable format.
 * Accepts the v2 category string (post.newCategory).
 */
export function getTimeRemaining(category: string | null | undefined, createdAt: Date, commentCount = 0): {
  expired: boolean
  hoursLeft: number
  label: { ar: string; en: string }
} {
  const hours = (category && EXPIRY_HOURS[category]) || DEFAULT_HOURS
  const multiplier = commentCount >= HIGH_ENGAGEMENT_COMMENTS ? 2 : 1
  const expiryMs = hours * multiplier * 60 * 60 * 1000
  const expiryDate = new Date(createdAt.getTime() + expiryMs)
  const remaining = expiryDate.getTime() - Date.now()

  if (remaining <= 0) {
    return { expired: true, hoursLeft: 0, label: { ar: 'منتهي', en: 'Expired' } }
  }

  const hoursLeft = Math.ceil(remaining / (60 * 60 * 1000))

  if (hoursLeft <= 1) {
    return { expired: false, hoursLeft, label: { ar: 'أقل من ساعة', en: 'Less than 1h' } }
  }
  if (hoursLeft <= 24) {
    return { expired: false, hoursLeft, label: { ar: `${hoursLeft} ساعة`, en: `${hoursLeft}h left` } }
  }
  const days = Math.ceil(hoursLeft / 24)
  return { expired: false, hoursLeft, label: { ar: `${days} يوم`, en: `${days}d left` } }
}

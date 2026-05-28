import type { SquareIntentCode } from './detectIntent'

/**
 * Map a detectSquareIntent() soft-nudge code to the post category we
 * want the user to land on when they tap "Convert to post". Returns
 * undefined for codes that don't have a clean mapping; the post
 * composer then falls back to its default category picker.
 *
 * The mapping mirrors what the soft-nudge copy already suggests:
 *   - service     → SERVICES section
 *   - lost_found  → LOST_FOUND
 *   - marketplace → MARKETPLACE
 *   - urgent_alert→ NEIGHBORHOOD_REPORTS
 */
export function squareIntentToPostCategory(code: SquareIntentCode | null | undefined): string | undefined {
  switch (code) {
    case 'service':      return 'SERVICES'
    case 'lost_found':   return 'LOST_FOUND'
    case 'marketplace':  return 'MARKETPLACE'
    case 'urgent_alert': return 'NEIGHBORHOOD_REPORTS'
    default:             return undefined
  }
}

/** Build a /post/new URL that pre-fills the composer with the user's
 *  in-progress Square text. body/title/category are all optional —
 *  the post composer treats absent params as "start blank for this
 *  field" (its default behavior). */
export function buildConvertToPostHref(opts: {
  body?: string | null
  title?: string | null
  category?: string | null
}): string {
  const params = new URLSearchParams()
  if (opts.body && opts.body.trim()) params.set('body', opts.body.trim())
  if (opts.title && opts.title.trim()) params.set('title', opts.title.trim())
  if (opts.category) params.set('category', opts.category)
  const qs = params.toString()
  return qs ? `/post/new?${qs}` : '/post/new'
}

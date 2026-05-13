import type { PostCategory, PostIntent, MarketplaceType } from '@prisma/client'

/**
 * Single source of truth for "does this post need a real title?".
 *
 * Title is REQUIRED for commercial / structured posts where the
 * headline is part of the listing's value:
 *   - MARKETPLACE (SELL / BUY / JOB) — the title IS the listing
 *   - HOME_BUSINESSES with intent OFFER — menu / product name
 *   - SERVICES with intent OFFER — service headline
 *   - REAL_ESTATE with intent OFFER — apartment headline
 *   - EVENTS — event name
 *   - COMPETITIONS — contest name
 *
 * Title is OPTIONAL for lightweight / conversational posts where
 * the body already speaks for itself:
 *   - GENERAL ("معلومة لأهل الحي")
 *   - NEIGHBORHOOD_REPORTS — "الشارع عند الصيدلية خطر" doesn't need a separate headline
 *   - LOST_FOUND — "ضاع كلبي البودل عند المسجد" stands alone
 *   - SERVICES with intent REQUEST — same as the Ask flow today
 *   - REAL_ESTATE with intent REQUEST — "أبحث عن شقة 3 غرف" stands alone
 *   - HOME_BUSINESSES with intent REQUEST — same shape as service request
 *   - RIDES — handled by /rides/new with its own form, never reaches this gate
 *
 * Used by:
 *   - /api/posts POST validation (reject empty title for required categories)
 *   - /api/posts/[id] PATCH validation (block edit that empties a required title)
 *   - /post/new composer (collapsed "add title" link vs always-visible input)
 *   - PostCard edit form (allow empty save for optional categories)
 */
export function isTitleRequired(
  category: PostCategory,
  intent: PostIntent,
  marketplaceType: MarketplaceType | null | undefined,
): boolean {
  switch (category) {
    case 'MARKETPLACE':
      // SELL / BUY / JOB — all three need a headline. JOB has the
      // strictest anti-spam guards already, and "phone number" titles
      // get blocked there separately.
      return true
    case 'HOME_BUSINESSES':
    case 'SERVICES':
    case 'REAL_ESTATE':
      // OFFER side needs a headline; REQUEST side ("looking for…")
      // is fine with body-only.
      return intent !== 'REQUEST'
    case 'EVENTS':
    case 'COMPETITIONS':
      // Both are admin/structured surfaces — the title is shown in
      // every listing rail and notification.
      return true
    case 'GENERAL':
    case 'NEIGHBORHOOD_REPORTS':
    case 'LOST_FOUND':
    case 'RIDES':
    default:
      return false
  }
}

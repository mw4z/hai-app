/**
 * Outside-neighborhood posting policy — the SINGLE source of truth.
 *
 * A user posting to a neighborhood that isn't their home ("outside")
 * may ONLY send an intent=REQUEST post in a tiny set of question-style
 * categories. Everything transactional (marketplace), promotional
 * (service offers), urgent (raised priority), or moderation-sensitive
 * (alerts / reports / events / competitions / real-estate) is blocked.
 *
 * The /api/posts route calls evaluateOutsideRequest() as the server-side
 * gate (rejecting manipulated clients), and the Ask UI mirrors
 * OUTSIDE_REQUEST_CATEGORIES so a user can't even reach a blocked path.
 */

// The only categories an outsider may post a REQUEST in.
export const OUTSIDE_REQUEST_CATEGORIES: ReadonlySet<string> = new Set([
  'GENERAL',   // a general question / recommendation to the neighborhood
  'SERVICES',  // "looking for a service" — the asking (REQUEST) side only
])

// Rolling-24h caps for outside requests (on top of the normal daily cap).
export const OUTSIDE_MAX_PER_HOOD_PER_DAY = 2  // to one neighborhood
export const OUTSIDE_MAX_TOTAL_PER_DAY = 5     // across all neighborhoods

export type OutsideGateCode =
  | 'OUTSIDE_REQUEST_ONLY'
  | 'OUTSIDE_CATEGORY_BLOCKED'
  | 'OUTSIDE_MARKETPLACE_BLOCKED'
  | 'OUTSIDE_PRIORITY_BLOCKED'

export interface OutsideGateInput {
  /** True when the author is NOT a resident of the target neighborhood. */
  isOutside: boolean
  /** Raw intent the client sent (undefined = none). */
  intentInput?: string
  /** Category the client sent (already validated against the enum). */
  category: string
  /** Raw marketplaceType the client sent (undefined = none). */
  marketplaceTypeInput?: string
  /** Raw priority the client sent (undefined = none). */
  priorityInput?: string
}

export type OutsideGateResult =
  | { ok: true }
  | { ok: false; code: OutsideGateCode; messageAr: string }

/**
 * Pure policy decision. Residents (isOutside=false) always pass — their
 * posting rights are unchanged. Outsiders are held to REQUEST-only in the
 * allowlisted categories, no marketplaceType, no raised priority.
 */
export function evaluateOutsideRequest(input: OutsideGateInput): OutsideGateResult {
  if (!input.isOutside) return { ok: true }

  // Only REQUEST. A missing intent is treated as REQUEST (the outside
  // Ask UI always sends REQUEST); OFFER / NORMAL are rejected.
  if ((input.intentInput ?? 'REQUEST') !== 'REQUEST') {
    return { ok: false, code: 'OUTSIDE_REQUEST_ONLY', messageAr: 'يمكنك إرسال طلب فقط في حيٍّ لست من سكانه' }
  }
  if (!OUTSIDE_REQUEST_CATEGORIES.has(input.category)) {
    return { ok: false, code: 'OUTSIDE_CATEGORY_BLOCKED', messageAr: 'هذا القسم غير متاح للنشر من خارج الحي' }
  }
  if (input.marketplaceTypeInput) {
    return { ok: false, code: 'OUTSIDE_MARKETPLACE_BLOCKED', messageAr: 'لا يمكن نشر إعلانات السوق من خارج الحي' }
  }
  if (input.priorityInput === 'HIGH' || input.priorityInput === 'CRITICAL') {
    return { ok: false, code: 'OUTSIDE_PRIORITY_BLOCKED', messageAr: 'لا يمكن رفع الأولوية من خارج الحي' }
  }
  return { ok: true }
}

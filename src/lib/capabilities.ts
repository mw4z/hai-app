/**
 * User Capabilities — plan-based feature limits.
 *
 * This is an INTERNAL system. Users never see plan names or limits in UI.
 * When a limit is reached, show neutral messages like "You've reached the limit for now".
 *
 * Plans:
 *   FREE    — default, generous limits
 *   PREMIUM — future paid tier (not active yet)
 *
 * To change a user's plan: update user.plan in DB (admin-only).
 * To adjust limits: change the numbers below. No code changes needed elsewhere.
 */

export type Plan = 'FREE' | 'PREMIUM'

// ─── Limit Definitions ──────────────────────────────────────────────────────

// ─── Numeric Limits ─────────────────────────────────────────────────────────

export interface PlanLimits {
  postsPerDay: number
  rideOffersPerDay: number
  activeRideRequests: number
  catalogItems: number
  threadsPerDay: number
  uploadsPerDay: number
  bioMaxLength: number
  serviceDescMaxLength: number
  feedBoostMultiplier: number
  featuredListingSlots: number
}

// ─── Boolean Entitlements ───────────────────────────────────────────────────

export interface PlanEntitlements {
  canFeatureListings: boolean    // pin catalog items at top of profile
  canPrioritySearch: boolean     // rank higher in neighborhood search
  canReorderCatalog: boolean     // drag to reorder catalog items
  canBoostPosts: boolean         // boost individual posts in feed
  canExtendedBio: boolean        // longer bio + service description
  canBulkUpload: boolean         // upload multiple catalog images at once
}

// ─── Combined Plan Config ───────────────────────────────────────────────────

interface PlanConfig {
  limits: PlanLimits
  entitlements: PlanEntitlements
}

const PLANS: Record<Plan, PlanConfig> = {
  FREE: {
    limits: {
      postsPerDay: 3,
      rideOffersPerDay: 3,
      activeRideRequests: 1,
      catalogItems: 3,
      threadsPerDay: 6,
      uploadsPerDay: 7,
      bioMaxLength: 300,
      serviceDescMaxLength: 500,
      feedBoostMultiplier: 1.0,
      featuredListingSlots: 0,
    },
    entitlements: {
      canFeatureListings: false,
      canPrioritySearch: false,
      canReorderCatalog: false,
      canBoostPosts: false,
      canExtendedBio: false,
      canBulkUpload: false,
    },
  },
  PREMIUM: {
    limits: {
      postsPerDay: 10,
      rideOffersPerDay: 20,
      activeRideRequests: 3,
      catalogItems: 20,
      threadsPerDay: 50,
      uploadsPerDay: 30,
      bioMaxLength: 500,
      serviceDescMaxLength: 1000,
      feedBoostMultiplier: 1.3,
      featuredListingSlots: 3,
    },
    entitlements: {
      canFeatureListings: true,
      canPrioritySearch: true,
      canReorderCatalog: true,
      canBoostPosts: true,
      canExtendedBio: true,
      canBulkUpload: true,
    },
  },
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Get the numeric limits for a plan */
export function getLimits(plan: string): PlanLimits {
  return (PLANS[plan as Plan] || PLANS.FREE).limits
}

/** Get the boolean entitlements for a plan */
export function getEntitlements(plan: string): PlanEntitlements {
  return (PLANS[plan as Plan] || PLANS.FREE).entitlements
}

/** Get full plan config */
export function getPlanConfig(plan: string): PlanConfig {
  return PLANS[plan as Plan] || PLANS.FREE
}

/** Check if a numeric limit allows one more action */
export function canPerform(plan: string, key: keyof PlanLimits, currentCount: number): boolean {
  const limit = getLimits(plan)[key]
  return currentCount < limit
}

/** Check a boolean entitlement */
export function hasEntitlement(plan: string, key: keyof PlanEntitlements): boolean {
  return getEntitlements(plan)[key]
}

/**
 * Get a neutral, non-monetization message when limit is reached.
 * NEVER mentions premium, upgrade, or payment.
 */
export function getLimitMessage(key: keyof PlanLimits, lang: string): string {
  const messages: Record<string, { ar: string; en: string }> = {
    postsPerDay:         { ar: 'وصلت الحد الأقصى للمنشورات اليوم', en: "You've reached today's post limit" },
    rideOffersPerDay:    { ar: 'وصلت الحد الأقصى للعروض اليوم', en: "You've reached today's offer limit" },
    activeRideRequests:  { ar: 'لديك طلب نشط بالفعل', en: 'You already have an active request' },
    catalogItems:        { ar: 'وصلت الحد الأقصى للعناصر حالياً', en: "You've reached the item limit for now" },
    threadsPerDay:       { ar: 'وصلت الحد الأقصى للمحادثات اليوم', en: "You've reached today's chat limit" },
    uploadsPerDay:       { ar: 'وصلت الحد الأقصى للرفع اليوم', en: "You've reached today's upload limit" },
  }
  const msg = messages[key]
  if (!msg) return lang === 'en' ? "You've reached the limit for now" : 'وصلت الحد الأقصى حالياً'
  return lang === 'en' ? msg.en : msg.ar
}

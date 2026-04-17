/**
 * User badge logic — pure functions, client-safe.
 *
 * Badge slots (in display order):
 *   1. Role badge   (🏅 mod, 👑 admin)
 *   2. Primary      (🛡 verified, 🛠 provider)
 *   3. Tier dot     (● colored by tier — no mixed emoji)
 */

export interface UserBadge {
  emoji: string
  ar: string
  en: string
  ur: string
}

export function getPrimaryBadge(accountType: string, providerStatus?: string | null): UserBadge | null {
  // Verified admin approval wins regardless of providerStatus drift
  if (accountType === 'VERIFIED_PROVIDER') return { emoji: '🛡', ar: 'موثّق', en: 'Verified', ur: 'تصدیق شدہ' }
  // Only show the "Provider" badge publicly when the status gate allows it.
  // PENDING providers stay invisible in listings and badges until they pass
  // the quality gate — matches the gating applied in API routes.
  if (accountType === 'SERVICE_PROVIDER' && (providerStatus === 'ACTIVE' || providerStatus === 'VERIFIED')) {
    return { emoji: '🛠', ar: 'مقدم خدمة', en: 'Provider', ur: 'خدمت گزار' }
  }
  return null
}

/** Role badge — shown for neighborhood mods and above */
export function getRoleBadge(role: string): UserBadge | null {
  if (role === 'NEIGHBORHOOD_MOD') return { emoji: '🏅', ar: 'مشرف الحي', en: 'Neighborhood Mod', ur: 'محلہ ناظم' }
  if (role === 'PLATFORM_MOD') return { emoji: '🛡', ar: 'مشرف المنصة', en: 'Platform Mod', ur: 'پلیٹ فارم ناظم' }
  if (role === 'SUPER_ADMIN') return { emoji: '👑', ar: 'مدير', en: 'Admin', ur: 'ایڈمن' }
  return null
}

/**
 * Tier badge — unified dot system.
 * Returns dot character + tailwind color class.
 * Null for "new" tier (no badge shown).
 */
export interface TierBadge {
  dot: string
  colorClass: string
  ar: string
  en: string
  ur: string
}

export function getTierBadge(reputation: number): TierBadge | null {
  if (reputation >= 400) return { dot: '●', colorClass: 'text-amber-500', ar: 'عضو مميز', en: 'Distinguished', ur: 'ممتاز' }
  if (reputation >= 150) return { dot: '●', colorClass: 'text-green-500', ar: 'موثوق', en: 'Trusted', ur: 'قابل اعتماد' }
  if (reputation >= 50)  return { dot: '●', colorClass: 'text-blue-500', ar: 'نشط', en: 'Active', ur: 'سرگرم' }
  return { dot: '●', colorClass: 'text-gray-400', ar: 'جديد', en: 'New', ur: 'نیا' }
}

/** @deprecated — use getTierBadge instead for new code */
export function getSecondaryBadge(reputation: number): UserBadge | null {
  const tier = getTierBadge(reputation)
  if (!tier) return null
  return { emoji: tier.dot, ar: tier.ar, en: tier.en, ur: tier.ur }
}

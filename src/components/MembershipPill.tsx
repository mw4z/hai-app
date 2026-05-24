'use client'

import { membershipBadge, type Membership } from '@/lib/membership'
import { useLanguage } from '@/hooks/useLanguage'

/**
 * Small pill showing a user's neighborhood-membership state:
 *   VERIFIED_RESIDENT → ساكن مؤكد   (green)
 *   CLAIMED_RESIDENT  → مرتبط بالحي (amber)
 *   OUTSIDE           → من خارج الحي (gray)
 * Verified is the "default good" state, so it's only rendered when
 * `showVerified` is set (avoids badging the whole app green).
 */
export default function MembershipPill({
  membership,
  showVerified = false,
  className = '',
}: {
  membership: Membership | null | undefined
  showVerified?: boolean
  className?: string
}) {
  const { lang } = useLanguage()
  if (!membership) return null
  if (membership === 'VERIFIED_RESIDENT' && !showVerified) return null

  const b = membershipBadge(membership)
  if (!b) return null
  const label = lang === 'en' ? b.en : lang === 'ur' ? b.ur : b.ar

  const tone =
    b.state === 'verified'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
      : b.state === 'claimed'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'

  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${tone} ${className}`}>
      {b.state === 'verified' ? '✓ ' : b.state === 'claimed' ? '📍 ' : ''}
      {label}
    </span>
  )
}

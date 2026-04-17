'use client'

import { getPrimaryBadge, getRoleBadge, getTierBadge } from '@/lib/user-badge'
import { useLanguage } from '@/hooks/useLanguage'

/** Blue verification check — for identity (providers, mods) */
function VerifyCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className || 'w-[14px] h-[14px]'} fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.4 14.6L6 12l1.4-1.4 3.2 3.2 6.4-6.4L18.4 8.8l-7.8 7.8z" />
    </svg>
  )
}

/**
 * Primary badge row — inline with username.
 * Shows: role badge + verification check (identity signals only).
 * No tier here — tier is shown separately below.
 */
export default function UserBadgeDisplay({
  accountType,
  providerStatus,
  reputation,
  role,
  showLabel = false,
  lightText = false,
}: {
  accountType?: string
  providerStatus?: string | null
  reputation: number
  role?: string
  showLabel?: boolean
  lightText?: boolean
}) {
  const { lang } = useLanguage()
  const roleBadge = getRoleBadge(role || '')
  const primary = getPrimaryBadge(accountType || 'NORMAL', providerStatus)

  // Identity badges only — no tier in this component
  if (!roleBadge && !primary) return null

  function label(obj: { ar: string; en: string; ur: string }) {
    if (lang === 'en') return obj.en
    if (lang === 'ur') return obj.ur
    return obj.ar
  }

  const labelColor = lightText ? 'text-white/90' : 'text-gray-500'

  return (
    <span className="inline-flex items-center gap-1 mx-1">
      {roleBadge && (
        <span className="text-[11px] leading-none" title={label(roleBadge)}>
          {roleBadge.emoji}
          {showLabel && <span className={`mr-0.5 ${lightText ? 'text-white/90' : 'text-amber-600 dark:text-amber-400'}`}>{label(roleBadge)}</span>}
        </span>
      )}

      {primary && (
        <span className="inline-flex items-center gap-0.5">
          {accountType === 'VERIFIED_PROVIDER'
            ? <VerifyCheck className="w-[14px] h-[14px] text-blue-500 flex-shrink-0" />
            : <span className="text-[11px] leading-none">{primary.emoji}</span>
          }
          {showLabel && <span className={`text-[10px] leading-none ${labelColor}`}>{label(primary)}</span>}
        </span>
      )}
    </span>
  )
}

/**
 * Tier label — shown below username or in profile.
 * Subtle text badge, not an icon.
 */
export function TierLabel({
  reputation,
  compact = false,
}: {
  reputation: number
  compact?: boolean
}) {
  const { lang } = useLanguage()
  const tier = getTierBadge(reputation)
  if (!tier) return null // "new" tier = no label

  function label(obj: { ar: string; en: string; ur: string }) {
    if (lang === 'en') return obj.en
    if (lang === 'ur') return obj.ur
    return obj.ar
  }

  const colors: Record<string, string> = {
    'text-amber-500': 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
    'text-green-500': 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
    'text-blue-500':  'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700',
  }

  const colorClass = colors[tier.colorClass] || 'text-gray-500 bg-gray-100'

  if (compact) {
    return <span className={`text-[9px] font-medium ${colorClass} px-1.5 py-0.5 rounded-full`}>{label(tier)}</span>
  }

  return <span className={`text-[10px] font-medium ${colorClass} px-2 py-0.5 rounded-full`}>{label(tier)}</span>
}

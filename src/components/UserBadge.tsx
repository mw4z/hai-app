'use client'

import { getPrimaryBadge, getRoleBadge, getTierBadge } from '@/lib/user-badge'
import { useLanguage } from '@/hooks/useLanguage'

/** Blue verification check — identity (providers, mods). Color comes
 *  from the design system via `.hai-verified-mark`. */
function VerifyCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`hai-verified-mark ${className || 'hai-icon-sm'}`} fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.4 14.6L6 12l1.4-1.4 3.2 3.2 6.4-6.4L18.4 8.8l-7.8 7.8z" />
    </svg>
  )
}

/** Map role → semantic state key for the design system. */
function roleState(role?: string): 'admin' | 'mod' | null {
  if (!role) return null
  if (role === 'SUPER_ADMIN') return 'admin'
  if (role === 'NEIGHBORHOOD_MOD' || role === 'PLATFORM_MOD') return 'mod'
  return null
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
  const rState = roleState(role)

  // Identity badges only — no tier in this component
  if (!roleBadge && !primary) return null

  function label(obj: { ar: string; en: string; ur: string }) {
    if (lang === 'en') return obj.en
    if (lang === 'ur') return obj.ur
    return obj.ar
  }

  const primaryState = accountType === 'VERIFIED_PROVIDER' ? 'verified' : 'provider'

  return (
    <span className="hai-row-1 hai-user-badges">
      {roleBadge && (
        <span className="hai-row-1 hai-user-badge-slot" title={label(roleBadge)}>
          <span className="hai-user-badge-emoji">{roleBadge.emoji}</span>
          {showLabel && rState && (
            <span className="hai-state-pill" data-state={rState}>{label(roleBadge)}</span>
          )}
        </span>
      )}

      {primary && (
        <span className="hai-row-1 hai-user-badge-slot">
          {accountType === 'VERIFIED_PROVIDER'
            ? <VerifyCheck />
            : <span className="hai-user-badge-emoji">{primary.emoji}</span>
          }
          {showLabel && (
            <span className="hai-state-pill" data-state={primaryState} data-light-text={lightText ? 'true' : 'false'}>
              {label(primary)}
            </span>
          )}
        </span>
      )}
    </span>
  )
}

/**
 * Tier label — shown below username or in profile.
 * Semantic badge driven by the `[data-tier]` attribute.
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
  if (!tier || tier.tier === 'new') return null // "new" tier = no label

  function label(obj: { ar: string; en: string; ur: string }) {
    if (lang === 'en') return obj.en
    if (lang === 'ur') return obj.ur
    return obj.ar
  }

  const cls = compact ? 'hai-tier-badge hai-tier-badge--compact' : 'hai-tier-badge'
  return <span className={cls} data-tier={tier.tier}>{label(tier)}</span>
}

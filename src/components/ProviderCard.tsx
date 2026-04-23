'use client'

/**
 * ProviderCard — reusable provider-profile summary.
 *
 * Which badges render (and their order) is resolved by the display
 * policy; this component is purely a composition target.
 */

import { FiMessageCircle, FiPhone, FiShare2 } from 'react-icons/fi'
import UserBadgeDisplay, { TierLabel } from './UserBadge'
import {
  resolveBadgePlan,
  type ModerationState,
  type PromotionState,
} from '@/lib/display-policy'
import { StatePill } from '@/lib/state-render'

export interface ProviderCardProps {
  id: string
  name: string | null
  avatarUrl?: string | null
  bio?: string
  /** Provider business metadata (drives identity pills) */
  accountType?: string
  providerStatus?: string | null
  reputation: number
  role?: string
  /** Category enums the provider operates in */
  serviceCategories?: { category: string; label: string; icon?: string }[]
  /** Optional stat rows (e.g. completed jobs, response time) */
  stats?: { label: string; value: string }[]
  /** Promotion(s) for paid-placement providers — policy dedupes. */
  promotions?: PromotionState[]
  /** Moderation state applicable to the provider listing. */
  moderation?: ModerationState | null
  /** Translated state labels keyed by promotion/moderation state name. */
  stateLabels?: Partial<Record<string, string>>
  onContact?: () => void
  onCall?: () => void
  onShare?: () => void
  onOpen?: () => void
  labels?: {
    contact?: string
    call?: string
    share?: string
  }
}

export default function ProviderCard({
  name,
  avatarUrl,
  bio,
  accountType,
  providerStatus,
  reputation,
  role,
  serviceCategories = [],
  stats = [],
  promotions = [],
  moderation = null,
  stateLabels,
  onContact,
  onCall,
  onShare,
  onOpen,
  labels,
}: ProviderCardProps) {
  // Providers have no listing lifecycle of their own, but promotion + moderation
  // still flow through the same policy so suppression is consistent across surfaces.
  const plan = resolveBadgePlan({
    moderation,
    promotions,
    labels: stateLabels,
  })

  const cardClasses = [
    'hai-card',
    plan.featuredRing ? 'hai-featured-ring' : '',
  ].filter(Boolean).join(' ')

  return (
    <article className={cardClasses} onClick={onOpen}>
      {/* Header: avatar + identity + policy-resolved moderation/promotion pills */}
      <header className="hai-row-3 hai-items-start">
        <div className="hai-avatar hai-avatar--lg">
          {avatarUrl
            ? <img src={avatarUrl} alt="" />
            : (name?.[0] || '؟')}
        </div>
        <div className="hai-flex-1 hai-min-w-0 hai-stack-1">
          <div className="hai-row-1">
            <span className="hai-h4 hai-truncate">{name || '—'}</span>
            <UserBadgeDisplay
              accountType={accountType}
              providerStatus={providerStatus}
              reputation={reputation}
              role={role}
            />
          </div>
          <div className="hai-row-1 hai-flex-wrap">
            <TierLabel reputation={reputation} />
            {plan.topRail.map((pill) => (
              <StatePill key={`${pill.family}-${pill.state}`} pill={pill} />
            ))}
          </div>
        </div>
      </header>

      {plan.suppressed ? null : (
        <>
          {/* Bio */}
          {bio && (
            <p className="hai-body hai-tc-sub hai-mt-3 line-clamp-3">{bio}</p>
          )}

          {/* Service categories — reuses the category badge primitive */}
          {serviceCategories.length > 0 && (
            <div className="hai-row-1 hai-flex-wrap hai-mt-3">
              {serviceCategories.map((c) => (
                <span key={c.category} className="hai-category-badge" data-category={c.category}>
                  {c.icon && <span>{c.icon}</span>}
                  <span>{c.label}</span>
                </span>
              ))}
            </div>
          )}

          {/* Stat rows */}
          {stats.length > 0 && (
            <div className="hai-stack-1 hai-mt-3">
              {stats.map((s) => (
                <div key={s.label} className="hai-status-row">
                  <span className="hai-status-row__label">{s.label}</span>
                  <span className="hai-body-strong">{s.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Policy-resolved meta row (secondary promotions, etc.) */}
          {plan.meta.length > 0 && (
            <div className="hai-row-1 hai-flex-wrap hai-mt-2">
              {plan.meta.map((pill) => (
                <StatePill key={`meta-${pill.family}-${pill.state}`} pill={pill} />
              ))}
            </div>
          )}

          {/* Action bar */}
          {(onContact || onCall || onShare) && (
            <div className="hai-action-bar">
              {onContact && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onContact() }}
                  className="hai-action-btn is-brand"
                >
                  <FiMessageCircle className="hai-icon-md hai-action-btn__icon" />
                  {labels?.contact && <span className="hai-action-btn__label">{labels.contact}</span>}
                </button>
              )}
              {onCall && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onCall() }}
                  className="hai-action-btn is-brand"
                >
                  <FiPhone className="hai-icon-md hai-action-btn__icon" />
                  {labels?.call && <span className="hai-action-btn__label">{labels.call}</span>}
                </button>
              )}
              {onShare && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onShare() }}
                  className="hai-action-btn"
                >
                  <FiShare2 className="hai-icon-md hai-action-btn__icon" />
                  {labels?.share && <span className="hai-action-btn__label">{labels.share}</span>}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </article>
  )
}

'use client'

/**
 * MarketplaceCard — reusable product/service card.
 *
 * Visual appearance is locked to the design system. *Which* badges
 * render, in what order, and under what suppression rules is locked
 * to the display policy in src/lib/display-policy.ts — never decided
 * inline here.
 */

import { FiHeart, FiMessageCircle, FiShare2 } from 'react-icons/fi'
import UserBadgeDisplay, { TierLabel } from './UserBadge'
import RiyalIcon from './RiyalIcon'
import {
  resolveBadgePlan,
  type LifecycleState,
  type ModerationState,
  type PromotionState,
  type UrgencyState,
} from '@/lib/display-policy'
import { StatePill, StateDot } from '@/lib/state-render'
import { fullName } from '@/lib/displayName'

export interface MarketplaceSeller {
  id: string
  name: string | null
  lastName?: string | null
  avatarUrl?: string | null
  accountType?: string
  providerStatus?: string | null
  reputation: number
  role?: string
}

export interface MarketplaceCardProps {
  title: string
  description?: string
  /** Business category enum (drives .hai-category-badge) */
  category: string
  /** Translated human-readable category label */
  categoryLabel: string
  /** Optional icon glyph rendered alongside the category label */
  categoryIcon?: string
  /** Listing lifecycle state — policy decides where it renders. */
  lifecycle?: LifecycleState | null
  /** Moderation state — highest-priority signal; may suppress others. */
  moderation?: ModerationState | null
  /** Urgency — policy may convert this into a dot or top-rail pill. */
  urgency?: UrgencyState | null
  /** Active promotions — policy deduplicates & may suppress. */
  promotions?: PromotionState[]
  /**
   * Translated labels keyed by state / promotion name.
   * If a state has no matching label, the pill is simply not shown —
   * the policy handles that gracefully.
   */
  stateLabels?: Partial<Record<string, string>>
  /** Price in halalas-agnostic units; formatted by caller */
  price?: number | string | null
  /** Optional thumbnail image URL */
  imageUrl?: string | null
  seller: MarketplaceSeller
  timeAgoLabel?: string
  /** Bookmark on/off */
  bookmarked?: boolean
  onBookmark?: () => void
  onContact?: () => void
  onShare?: () => void
  onOpen?: () => void
  /** Labels for action buttons (i18n from caller) */
  labels?: {
    contact?: string
    share?: string
    bookmark?: string
  }
}

export default function MarketplaceCard({
  title,
  description,
  category,
  categoryLabel,
  categoryIcon,
  lifecycle = null,
  moderation = null,
  urgency = null,
  promotions = [],
  stateLabels,
  price,
  imageUrl,
  seller,
  timeAgoLabel,
  bookmarked = false,
  onBookmark,
  onContact,
  onShare,
  onOpen,
  labels,
}: MarketplaceCardProps) {
  const plan = resolveBadgePlan({
    moderation,
    urgency,
    lifecycle,
    promotions,
    labels: stateLabels,
  })

  // Policy suppresses body content directly (see !plan.suppressed below);
  // no new card variant is introduced — the empty body *is* the treatment.
  const cardClasses = [
    'hai-card',
    plan.featuredRing ? 'hai-featured-ring' : '',
  ].filter(Boolean).join(' ')

  return (
    <article className={cardClasses} onClick={onOpen}>
      {/* Top rail — category identity + policy-resolved state badges */}
      <header className="hai-row-2 hai-justify-between hai-items-start hai-mb-2">
        <span className="hai-category-badge" data-category={category}>
          {categoryIcon && <span>{categoryIcon}</span>}
          <span>{categoryLabel}</span>
        </span>
        <div className="hai-row-1">
          {plan.topRail.map((pill) => (
            <StatePill
              key={`${pill.family}-${pill.state}`}
              pill={{
                ...pill,
                label: (
                  <>
                    {pill.family === 'lifecycle' && plan.lifecycleUrgencyDot && (
                      <StateDot state={plan.lifecycleUrgencyDot} />
                    )}
                    {pill.label}
                  </>
                ),
              }}
            />
          ))}
        </div>
      </header>

      {/* Suppressed (hidden/removed) cards skip body content per policy. */}
      {!plan.suppressed && (
        <>
          {/* Image thumbnail (optional) */}
          {imageUrl && (
            <div className="hai-media-grid hai-mb-2" data-count="1">
              <div className="hai-media-grid__item">
                <img src={imageUrl} alt="" />
              </div>
            </div>
          )}

          {/* Title + description */}
          <div className="hai-stack-1">
            <h3 className="hai-h4">{title}</h3>
            {description && (
              <p className="hai-body hai-tc-sub line-clamp-2">{description}</p>
            )}
          </div>

          {/* Price */}
          {price != null && price !== '' && (
            <div className="hai-mt-2">
              <span className="hai-price">
                {typeof price === 'number' ? price.toLocaleString('ar-SA') : price}
                <RiyalIcon />
              </span>
            </div>
          )}

          {/* Seller identity strip */}
          <div className="hai-row-2 hai-mt-3">
            <div className="hai-avatar hai-avatar--sm">
              {seller.avatarUrl
                ? <img src={seller.avatarUrl} alt="" />
                : (seller.name?.[0] || '؟')}
            </div>
            <div className="hai-flex-1 hai-min-w-0">
              <div className="hai-row-1">
                <span className="hai-body-strong hai-truncate">{fullName(seller) || seller.name || '—'}</span>
                <UserBadgeDisplay
                  accountType={seller.accountType}
                  providerStatus={seller.providerStatus}
                  reputation={seller.reputation}
                  role={seller.role}
                />
              </div>
              <div className="hai-row-1">
                <TierLabel reputation={seller.reputation} compact />
                {timeAgoLabel && <span className="hai-meta">{timeAgoLabel}</span>}
              </div>
            </div>
          </div>

          {/* Meta row — secondary promotion/lifecycle signals moved here
              by the policy when the top rail is already at density cap. */}
          {plan.meta.length > 0 && (
            <div className="hai-row-1 hai-flex-wrap hai-mt-2">
              {plan.meta.map((pill) => (
                <StatePill key={`meta-${pill.family}-${pill.state}`} pill={pill} />
              ))}
            </div>
          )}

          {/* Action bar */}
          {(onContact || onShare || onBookmark) && (
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
              {onBookmark && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onBookmark() }}
                  data-selected={bookmarked ? 'true' : 'false'}
                  className="hai-action-btn is-liked"
                >
                  <FiHeart className={`hai-icon-md hai-action-btn__icon ${bookmarked ? 'hai-fill-current' : ''}`} />
                  {labels?.bookmark && <span className="hai-action-btn__label">{labels.bookmark}</span>}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </article>
  )
}

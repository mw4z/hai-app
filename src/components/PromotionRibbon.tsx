'use client'

/**
 * PromotionRibbon — monetization affordance (featured / boosted / pinned).
 *
 * Uses the display policy to:
 *   • de-duplicate boosted vs featured (boosted wins)
 *   • suppress promotion entirely when moderation/lifecycle forbids it
 *   • cap visible pills
 */

import * as React from 'react'
import {
  resolvePromotions,
  resolveBadgePlan,
  type LifecycleState,
  type ModerationState,
  type PromotionState,
} from '@/lib/display-policy'
import { StatePill } from '@/lib/state-render'

export type { PromotionState as PromotionType }

export interface PromotionRibbonProps {
  /** Active promotions for the listing. Caller supplies all; policy trims. */
  promotions: { type: PromotionState; label: string; icon?: string }[]
  /** Optional context so the ribbon can self-suppress under terminal
   *  lifecycles or moderation states. */
  lifecycle?: LifecycleState | null
  moderation?: ModerationState | null
  /** Visual density variant — compact for inline use. */
  compact?: boolean
}

export default function PromotionRibbon({
  promotions,
  lifecycle = null,
  moderation = null,
  compact = false,
}: PromotionRibbonProps) {
  // Policy first trims by moderation/lifecycle; then by precedence.
  const labelMap = Object.fromEntries(
    promotions.map((p) => [p.type, p.label]),
  ) as Partial<Record<PromotionState, string>>

  const plan = resolveBadgePlan({
    moderation,
    lifecycle,
    promotions: promotions.map((p) => p.type),
    labels: labelMap,
  })

  // Only render promotion-family pills from the plan. Moderation/lifecycle
  // belong elsewhere on the card, not in the promotion ribbon.
  const visible = [...plan.topRail, ...plan.meta].filter((p) => p.family === 'promotion')
  if (visible.length === 0) return null

  // Keep the icon lookup from the original input (icons aren't part of policy).
  const iconOf = Object.fromEntries(
    promotions.map((p) => [p.type, p.icon]),
  ) as Partial<Record<PromotionState, string | undefined>>

  // Preserve precedence order from resolvePromotions for a stable reading order.
  const order = resolvePromotions(promotions.map((p) => p.type))
  const sorted = [...visible].sort(
    (a, b) =>
      order.indexOf(a.state as PromotionState) - order.indexOf(b.state as PromotionState),
  )

  return (
    <div className={`hai-row-1 hai-flex-wrap ${compact ? '' : 'hai-mb-2'}`}>
      {sorted.map((p) => {
        const icon = iconOf[p.state as PromotionState]
        return (
          <StatePill
            key={p.state}
            pill={{
              ...p,
              label: (
                <>
                  {icon && <span>{icon}</span>}
                  <span>{p.label as React.ReactNode}</span>
                </>
              ),
            }}
          />
        )
      })}
    </div>
  )
}

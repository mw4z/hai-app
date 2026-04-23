'use client'

/**
 * ListingStatusRow — label/value row for listing lifecycle.
 *
 * The display policy decides whether urgency renders as a dot, as a
 * top pill, or is suppressed entirely; this component just obeys.
 */

import { resolveBadgePlan, type LifecycleState, type UrgencyState } from '@/lib/display-policy'
import { StatePill, StateDot } from '@/lib/state-render'

export type ListingLifecycleState = LifecycleState
export type ListingUrgency = UrgencyState | null

export interface ListingStatusRowProps {
  label: string
  state: ListingLifecycleState
  stateLabel: string
  urgency?: ListingUrgency
  urgencyLabel?: string
  meta?: string
}

export default function ListingStatusRow({
  label,
  state,
  stateLabel,
  urgency = null,
  urgencyLabel,
  meta,
}: ListingStatusRowProps) {
  const plan = resolveBadgePlan({
    lifecycle: state,
    urgency: urgency || null,
    labels: {
      [state]: stateLabel,
      ...(urgency && urgencyLabel ? { [urgency]: urgencyLabel } : {}),
    },
  })

  return (
    <div className="hai-status-row">
      <span className="hai-status-row__label">
        {plan.lifecycleUrgencyDot && <StateDot state={plan.lifecycleUrgencyDot} />}{' '}
        {label}
      </span>
      <span className="hai-row-2">
        {meta && <span className="hai-meta">{meta}</span>}
        {plan.topRail.map((pill) => (
          <StatePill key={`${pill.family}-${pill.state}`} pill={pill} />
        ))}
      </span>
    </div>
  )
}

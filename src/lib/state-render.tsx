/**
 * state-render.tsx — central enforcement for state-badge rendering.
 *
 * This file is the ONLY sanctioned source of `.hai-state-badge` and
 * `.hai-state-dot` DOM in the app. Two rules:
 *
 *   1. Any React code that needs a state pill or dot MUST import
 *      `<StatePill>` / `<StateDot>` from here.
 *   2. No component may render `.hai-state-badge` or `.hai-state-dot`
 *      directly (no raw `<span className="hai-state-badge">` either).
 *
 * Regression safety:
 *   The `stateFamily()` switch below is exhaustive over every legal
 *   state key. Adding a new state to the union in display-policy.ts
 *   forces TS to flag this file until the new state is classified —
 *   a new state cannot silently enter the UI without a family.
 *
 * Enforcement (CI grep guard):
 *   rg --glob 'src/**' --glob '!src/lib/state-render.tsx' \
 *      '\bhai-state-(badge|dot)\b'
 *   Any match is a violation (except design-tokens.css / docs).
 */

import * as React from 'react'
import type {
  DisplayPill,
  LifecycleState,
  ModerationState,
  PromotionState,
  UrgencyState,
} from './display-policy'

/** Trust "tier" keys may also surface through state-badge as `tier-<k>`. */
export type TierState =
  | 'tier-new' | 'tier-active' | 'tier-trusted' | 'tier-distinguished'

/** Trust identity keys also reach the state layer for pill rendering. */
export type IdentityState = 'verified' | 'provider' | 'mod' | 'admin'

/** Complete closed union of everything legally renderable by StatePill. */
export type StateKey =
  | ModerationState
  | UrgencyState
  | LifecycleState
  | PromotionState
  | TierState
  | IdentityState

export type StateFamily =
  | 'moderation'
  | 'urgency'
  | 'lifecycle'
  | 'promotion'
  | 'trust'
  | 'tier'

/** Classify a state key into its family — exhaustively.
 *
 *  Adding a new state key without updating this switch is a TS error
 *  (`never` branch at the end). That is intentional — the point of
 *  this function is to force every new state to declare its family. */
export function stateFamily(state: StateKey): StateFamily {
  switch (state) {
    // Moderation
    case 'pending':
    case 'restricted':
    case 'hidden':
    case 'flagged':
    case 'removed':
    case 'locked':
      return 'moderation'

    // Urgency
    case 'info':
    case 'warning':
    case 'urgent':
    case 'emergency':
      return 'urgency'

    // Lifecycle
    case 'open':
    case 'in-progress':
    case 'awaiting':
    case 'confirmed':
    case 'en-route':
    case 'arrived':
    case 'resolved':
    case 'closed':
    case 'sold':
    case 'expired':
    case 'unavailable':
    case 'disputed':
    case 'cancelled':
      return 'lifecycle'

    // Promotion
    case 'featured':
    case 'boosted':
    case 'pinned':
      return 'promotion'

    // Trust (identity)
    case 'verified':
    case 'provider':
    case 'mod':
    case 'admin':
      return 'trust'

    // Trust (tier)
    case 'tier-new':
    case 'tier-active':
    case 'tier-trusted':
    case 'tier-distinguished':
      return 'tier'

    default: {
      // If this line errors, a new state was added without a family.
      // Do NOT silence the error — classify the state here.
      const _exhaustive: never = state
      return _exhaustive
    }
  }
}

/**
 * <StatePill> — the ONE legitimate way to render `.hai-state-badge`.
 * Accepts either a raw state key + label or a DisplayPill from
 * resolveBadgePlan.
 */
export function StatePill(props:
  | { pill: DisplayPill; className?: string }
  | { state: StateKey; label: React.ReactNode; className?: string }
): JSX.Element {
  const className = 'className' in props && props.className
    ? `hai-state-badge ${props.className}`
    : 'hai-state-badge'

  if ('pill' in props) {
    return (
      <span className={className} data-state={props.pill.state}>
        {props.pill.label as React.ReactNode}
      </span>
    )
  }
  // Type-force that the explicit state is in the closed union.
  stateFamily(props.state)
  return (
    <span className={className} data-state={props.state}>
      {props.label}
    </span>
  )
}

/**
 * <StateDot> — the ONE legitimate way to render `.hai-state-dot`.
 * Used for urgency-beside-lifecycle, presence markers, tier dots.
 */
export function StateDot({
  state,
  className,
}: {
  state: StateKey
  className?: string
}): JSX.Element {
  stateFamily(state)
  const cls = className ? `hai-state-dot ${className}` : 'hai-state-dot'
  return <span className={cls} data-state={state} aria-hidden="true" />
}

/** Render a whole DisplayPill[] in order. */
export function StatePillRow({
  pills,
  keyPrefix = 'pill',
}: {
  pills: DisplayPill[]
  keyPrefix?: string
}): JSX.Element | null {
  if (pills.length === 0) return null
  return (
    <>
      {pills.map((p) => (
        <StatePill key={`${keyPrefix}-${p.family}-${p.state}`} pill={p} />
      ))}
    </>
  )
}

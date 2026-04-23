/**
 * Display policy — deterministic rendering rules for semantic states.
 *
 * Layer model recap:
 *   LAYER 1 — design tokens  (colors, spacing, z)
 *   LAYER 2 — primitives     (.hai-state-badge, .hai-category-badge, …)
 *   LAYER 3 — product cards  (MarketplaceCard, ProviderCard, …)
 *   LAYER 4 — policy         (THIS FILE)
 *
 * This file is pure: it takes business facts (moderation, urgency,
 * lifecycle, promotion, trust) and returns the *prescribed* render
 * plan for each surface slot. It contains NO styling, NO React, NO
 * side effects. The product cards consume it and render whatever
 * the policy returns — that way two different cards under the same
 * facts render identically.
 *
 *
 * ─────────────────────────────────────────────────────────────────
 * 1. PRIORITY BETWEEN SEMANTIC FAMILIES   (highest → lowest)
 * ─────────────────────────────────────────────────────────────────
 *     1. Moderation   (removed, hidden, locked, flagged, restricted, pending)
 *     2. Urgency      (emergency, urgent, warning, info)
 *     3. Lifecycle    (open, sold, closed, expired, …)
 *     4. Promotion    (featured, boosted, pinned)
 *     5. Trust        (admin, mod, verified, provider, tier)
 *
 *   Higher-priority signals own the top rail of a card; lower-priority
 *   signals either collapse, move to the meta row, or suppress entirely
 *   depending on the coexistence matrix below.
 *
 *
 * ─────────────────────────────────────────────────────────────────
 * 2. COEXISTENCE MATRIX
 * ─────────────────────────────────────────────────────────────────
 *   Moderation × everything:
 *     removed                 → suppress ALL other state signals;
 *                               render only the "removed" badge.
 *     hidden                  → suppress promotion AND lifecycle;
 *                               render only the "hidden" badge.
 *     locked / flagged /
 *     restricted / pending    → coexist with lifecycle; SUPPRESS all
 *                               promotion (cannot promote moderated
 *                               content). Urgency still renders.
 *
 *   Urgency × lifecycle:
 *     urgency ∈ {emergency, urgent}
 *                             → urgency OWNS the top rail, lifecycle
 *                               demotes to the meta row.
 *     urgency ∈ {warning, info}
 *                             → urgency renders as a dot *beside* the
 *                               lifecycle label (never as its own pill).
 *     info + lifecycle=open   → info suppressed (redundant with "open").
 *
 *   Lifecycle × promotion:
 *     lifecycle ∈ {sold, closed, expired, unavailable,
 *                  cancelled, resolved}
 *                             → ALL promotion signals suppressed.
 *                               (There's no product value in promoting
 *                               something that's no longer transactable.)
 *     lifecycle ∈ {open, in-progress, awaiting,
 *                  confirmed, en-route, arrived, disputed}
 *                             → promotion coexists with lifecycle.
 *
 *
 * ─────────────────────────────────────────────────────────────────
 * 3. DENSITY CAPS   (per card region)
 * ─────────────────────────────────────────────────────────────────
 *   Top rail (header slot):
 *     • max 1 moderation badge
 *     • max 1 lifecycle badge
 *     • max 1 promotion badge   (picked by promotion precedence below)
 *     ⇒ absolute cap: 3 pills in the header
 *
 *   Trust rail (inline with username):
 *     • max 1 identity pill     (admin > mod > verified > provider)
 *     • max 1 tier badge        ("new" tier never renders)
 *
 *   Overflow: anything beyond these caps moves to the meta row as
 *   plain text ("… +2 more") — NEVER stack a 4th pill in the header.
 *
 *
 * ─────────────────────────────────────────────────────────────────
 * 4. PROMOTION PRECEDENCE
 * ─────────────────────────────────────────────────────────────────
 *     boosted  >  featured      (boosted = paid, always wins over editorial)
 *     pinned   coexists with one of {boosted, featured}
 *
 *   Net effect: at most 2 promotion pills render (one of
 *   boosted|featured, plus optional pinned). Promotion always hides
 *   under the moderation / terminal-lifecycle suppression rules above.
 *
 *
 * ─────────────────────────────────────────────────────────────────
 * 5. TRUST DISPLAY
 * ─────────────────────────────────────────────────────────────────
 *   Identity pill priority (highest → lowest):
 *     admin   (SUPER_ADMIN)
 *     mod     (NEIGHBORHOOD_MOD / PLATFORM_MOD)
 *     verified (accountType == 'VERIFIED_PROVIDER')
 *     provider (SERVICE_PROVIDER with providerStatus ∈ {ACTIVE, VERIFIED})
 *
 *   The policy returns the single top identity key. The component
 *   may still choose to ALSO render lower-priority signals via
 *   hover/title attributes or an expanded view, but inline beside
 *   the username there is ONE identity pill.
 *
 *   Tier ladder:
 *     distinguished > trusted > active > new
 *   "new" never renders. Compact (feed) uses tier-badge--compact;
 *   expanded (profile) uses the full pill.
 *
 *
 * ─────────────────────────────────────────────────────────────────
 * 6. LIFECYCLE DISPLAY
 * ─────────────────────────────────────────────────────────────────
 *   Default: lifecycle pill sits in the top rail.
 *   With warning/info urgency: dot prepended to lifecycle label.
 *   With urgent/emergency urgency: urgency pill takes top-rail slot;
 *     lifecycle shifts to meta row as plain text.
 *   With moderation=hidden|removed: lifecycle hidden entirely.
 * ─────────────────────────────────────────────────────────────────
 */

/* ─────────────────────────────────────────────────────────────────
   Type definitions
   ───────────────────────────────────────────────────────────────── */

export type ModerationState =
  | 'pending' | 'restricted' | 'hidden' | 'flagged' | 'removed' | 'locked'

export type UrgencyState =
  | 'info' | 'warning' | 'urgent' | 'emergency'

export type LifecycleState =
  | 'open' | 'in-progress' | 'awaiting' | 'confirmed'
  | 'en-route' | 'arrived' | 'resolved' | 'closed'
  | 'sold' | 'expired' | 'unavailable' | 'disputed' | 'cancelled'

export type PromotionState = 'featured' | 'boosted' | 'pinned'

export type IdentityKey = 'admin' | 'mod' | 'verified' | 'provider'

export type TierKey = 'new' | 'active' | 'trusted' | 'distinguished'

/** A single pill the policy asks the component to render. */
export interface DisplayPill {
  /** Which semantic family this pill belongs to */
  family: 'moderation' | 'urgency' | 'lifecycle' | 'promotion'
  /** The [data-state] value */
  state: string
  /**
   * Human-readable label (supplied by caller via the labels map).
   * Typed as `React.ReactNode`-compatible: the design system stores
   * strings, but render sites may enrich the label (e.g. prepending
   * a `<StateDot/>`) before handing to <StatePill>. Kept as `unknown`
   * here to avoid pulling React into the pure policy module.
   */
  label: unknown
}

export interface BadgePlanInput {
  moderation?: ModerationState | null
  urgency?: UrgencyState | null
  lifecycle?: LifecycleState | null
  /** All currently-active promotions on the listing. */
  promotions?: PromotionState[]
  /**
   * Translated labels keyed by state name. Missing labels → pill skipped.
   * Accepts React nodes as well as strings, but the policy itself
   * never reads or transforms them — it just forwards.
   */
  labels?: Partial<Record<string, unknown>>
}

export interface BadgePlan {
  /** Pills to render in the top rail of the card (max 3). */
  topRail: DisplayPill[]
  /** Urgency dot color to prepend to the lifecycle label, if any. */
  lifecycleUrgencyDot: UrgencyState | null
  /** Items to render in the meta/overflow row as short text. */
  meta: DisplayPill[]
  /** Whether the card should receive the .hai-featured-ring outline. */
  featuredRing: boolean
  /** True if the content is so suppressed the body should be dimmed. */
  suppressed: boolean
}

/* ─────────────────────────────────────────────────────────────────
   Internal helpers
   ───────────────────────────────────────────────────────────────── */

const TERMINAL_LIFECYCLE: ReadonlySet<LifecycleState> = new Set<LifecycleState>([
  'sold', 'closed', 'expired', 'unavailable', 'cancelled', 'resolved',
])

/** Moderation states that hide everything beneath them. */
const MODERATION_HARD_SUPPRESS: ReadonlySet<ModerationState> = new Set<ModerationState>([
  'removed',
])

/** Moderation states that hide promotion + lifecycle but keep urgency. */
const MODERATION_SOFT_SUPPRESS: ReadonlySet<ModerationState> = new Set<ModerationState>([
  'hidden',
])

/** Moderation states that only suppress promotion. */
const MODERATION_PROMOTION_ONLY: ReadonlySet<ModerationState> = new Set<ModerationState>([
  'locked', 'flagged', 'restricted', 'pending',
])

function mkPill(
  family: DisplayPill['family'],
  state: string,
  labels: BadgePlanInput['labels']
): DisplayPill | null {
  const label = labels?.[state]
  if (!label) return null
  return { family, state, label }
}

/* ─────────────────────────────────────────────────────────────────
   4. PROMOTION PRECEDENCE
   Returns at most 2 promotion keys (boosted|featured + optional pinned).
   ───────────────────────────────────────────────────────────────── */
export function resolvePromotions(active: PromotionState[] | undefined): PromotionState[] {
  if (!active || active.length === 0) return []
  const set = new Set(active)
  const out: PromotionState[] = []
  // boosted wins over featured; they are mutually exclusive by policy.
  if (set.has('boosted'))      out.push('boosted')
  else if (set.has('featured')) out.push('featured')
  // pinned coexists with either.
  if (set.has('pinned'))       out.push('pinned')
  return out
}

/* ─────────────────────────────────────────────────────────────────
   5. TRUST DISPLAY
   ───────────────────────────────────────────────────────────────── */
export function resolveIdentity(opts: {
  role?: string
  accountType?: string
  providerStatus?: string | null
}): IdentityKey | null {
  if (opts.role === 'SUPER_ADMIN') return 'admin'
  if (opts.role === 'NEIGHBORHOOD_MOD' || opts.role === 'PLATFORM_MOD') return 'mod'
  if (opts.accountType === 'VERIFIED_PROVIDER') return 'verified'
  if (
    opts.accountType === 'SERVICE_PROVIDER' &&
    (opts.providerStatus === 'ACTIVE' || opts.providerStatus === 'VERIFIED')
  ) {
    return 'provider'
  }
  return null
}

export function resolveTier(reputation: number): TierKey {
  if (reputation >= 400) return 'distinguished'
  if (reputation >= 150) return 'trusted'
  if (reputation >= 50)  return 'active'
  return 'new'
}

/** True if the tier should visually render (new never renders). */
export function tierIsVisible(tier: TierKey): boolean {
  return tier !== 'new'
}

/* ─────────────────────────────────────────────────────────────────
   6. LIFECYCLE × URGENCY DISPLAY RULES
   ───────────────────────────────────────────────────────────────── */
function urgencyOwnsTopRail(u: UrgencyState | null | undefined): boolean {
  return u === 'urgent' || u === 'emergency'
}
function urgencyIsDot(u: UrgencyState | null | undefined): boolean {
  return u === 'warning' || u === 'info'
}

/* ─────────────────────────────────────────────────────────────────
   Top-level resolver — produces the render plan for a card.
   ───────────────────────────────────────────────────────────────── */
export function resolveBadgePlan(input: BadgePlanInput): BadgePlan {
  const labels = input.labels ?? {}
  const topRail: DisplayPill[] = []
  const meta: DisplayPill[] = []
  let lifecycleUrgencyDot: UrgencyState | null = null

  const mod = input.moderation ?? null
  const urg = input.urgency ?? null
  const life = input.lifecycle ?? null
  const prom = resolvePromotions(input.promotions)

  /* ── 1. Hard suppression ──────────────────────────────────────── */
  if (mod && MODERATION_HARD_SUPPRESS.has(mod)) {
    const pill = mkPill('moderation', mod, labels)
    if (pill) topRail.push(pill)
    return { topRail, lifecycleUrgencyDot: null, meta, featuredRing: false, suppressed: true }
  }

  /* ── 2. Soft moderation (hidden) — keep only moderation + urgency */
  const softSuppressed = !!mod && MODERATION_SOFT_SUPPRESS.has(mod)

  /* ── 3. Moderation badge ──────────────────────────────────────── */
  if (mod) {
    const pill = mkPill('moderation', mod, labels)
    if (pill) topRail.push(pill)
  }

  /* ── 4. Urgency ───────────────────────────────────────────────── */
  let effectiveUrgency: UrgencyState | null = urg
  // info is redundant when lifecycle says "open"
  if (effectiveUrgency === 'info' && life === 'open') effectiveUrgency = null

  if (effectiveUrgency && urgencyOwnsTopRail(effectiveUrgency)) {
    const pill = mkPill('urgency', effectiveUrgency, labels)
    if (pill) topRail.push(pill)
  } else if (effectiveUrgency && urgencyIsDot(effectiveUrgency)) {
    lifecycleUrgencyDot = effectiveUrgency
  }

  /* ── 5. Lifecycle ─────────────────────────────────────────────── */
  if (life && !softSuppressed) {
    if (effectiveUrgency && urgencyOwnsTopRail(effectiveUrgency)) {
      // Urgency owns the top rail → lifecycle slips to meta.
      const pill = mkPill('lifecycle', life, labels)
      if (pill) meta.push(pill)
    } else {
      const pill = mkPill('lifecycle', life, labels)
      if (pill) topRail.push(pill)
    }
  }

  /* ── 6. Promotion ─────────────────────────────────────────────── */
  const promotionBlockedByModeration =
    !!mod && (MODERATION_SOFT_SUPPRESS.has(mod) || MODERATION_PROMOTION_ONLY.has(mod))
  const promotionBlockedByLifecycle =
    !!life && TERMINAL_LIFECYCLE.has(life)
  const promotionAllowed = !promotionBlockedByModeration && !promotionBlockedByLifecycle

  let featuredRing = false
  if (promotionAllowed && prom.length > 0) {
    // Top rail already has at most (moderation? + urgency/lifecycle).
    // Budget is 3 pills — reserve the last slot for the primary promotion.
    const primary = prom[0]
    const primaryPill = mkPill('promotion', primary, labels)
    if (primaryPill) {
      if (topRail.length < 3) topRail.push(primaryPill)
      else meta.push(primaryPill)
    }
    // Pinned (if present alongside boosted/featured) rides in the meta row.
    if (prom.length > 1) {
      const secondaryPill = mkPill('promotion', prom[1], labels)
      if (secondaryPill) meta.push(secondaryPill)
    }
    // Featured ring accompanies boosted or featured (not pinned-only).
    featuredRing = primary === 'boosted' || primary === 'featured'
  }

  return {
    topRail,
    lifecycleUrgencyDot,
    meta,
    featuredRing,
    suppressed: softSuppressed,
  }
}

/* ─────────────────────────────────────────────────────────────────
   Convenience resolvers for individual surfaces
   ───────────────────────────────────────────────────────────────── */

export interface TrustPlan {
  identity: IdentityKey | null
  tier: TierKey
  /** Whether the tier should render (drives `<TierLabel/>` rendering). */
  showTier: boolean
}

export function resolveTrustPlan(opts: {
  role?: string
  accountType?: string
  providerStatus?: string | null
  reputation: number
}): TrustPlan {
  const identity = resolveIdentity(opts)
  const tier = resolveTier(opts.reputation)
  return { identity, tier, showTier: tierIsVisible(tier) }
}

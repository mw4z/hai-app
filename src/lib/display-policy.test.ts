/**
 * Exhaustive tests for display-policy.ts.
 *
 * Zero external test runner deps — uses Node's built-in `node:test`
 * + `node:assert`. Run with:
 *
 *     npx ts-node --compiler-options '{"module":"CommonJS"}' \
 *       --test src/lib/display-policy.test.ts
 *
 * or, from CI with a built tsconfig:
 *
 *     node --test dist/lib/display-policy.test.js
 *
 * Assertions:
 *   • every moderation / urgency / lifecycle / promotion state is
 *     exercised at least once
 *   • coexistence rules hold
 *   • density caps are respected (top rail ≤ 3 pills)
 *   • suppression + featuredRing flags match the spec
 *   • identity / tier priority is deterministic
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveBadgePlan,
  resolvePromotions,
  resolveIdentity,
  resolveTier,
  resolveTrustPlan,
  tierIsVisible,
  type LifecycleState,
  type ModerationState,
  type PromotionState,
  type UrgencyState,
} from './display-policy'

/* ─────────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────────── */

function labelsFor(keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, k.toUpperCase()]))
}

function stateKeys(pills: { state: string }[]) {
  return pills.map((p) => p.state)
}

const ALL_MODERATION: ModerationState[] =
  ['pending', 'restricted', 'hidden', 'flagged', 'removed', 'locked']

const ALL_URGENCY: UrgencyState[] =
  ['info', 'warning', 'urgent', 'emergency']

const ALL_LIFECYCLE: LifecycleState[] = [
  'open', 'in-progress', 'awaiting', 'confirmed', 'en-route', 'arrived',
  'resolved', 'closed', 'sold', 'expired', 'unavailable', 'disputed', 'cancelled',
]

const ALL_PROMOTION: PromotionState[] = ['featured', 'boosted', 'pinned']

const TERMINAL_LIFECYCLE: LifecycleState[] =
  ['sold', 'closed', 'expired', 'unavailable', 'cancelled', 'resolved']

/* ─────────────────────────────────────────────────────────────────
   1. Moderation hard-suppression
   ───────────────────────────────────────────────────────────────── */
test('removed: hard suppression — only the removed badge renders', () => {
  const plan = resolveBadgePlan({
    moderation: 'removed',
    urgency: 'emergency',
    lifecycle: 'open',
    promotions: ['featured', 'boosted', 'pinned'],
    labels: labelsFor(['removed', 'emergency', 'open', 'featured', 'boosted', 'pinned']),
  })
  assert.deepEqual(stateKeys(plan.topRail), ['removed'])
  assert.equal(plan.meta.length, 0)
  assert.equal(plan.featuredRing, false)
  assert.equal(plan.suppressed, true)
  assert.equal(plan.lifecycleUrgencyDot, null)
})

/* ─────────────────────────────────────────────────────────────────
   2. Soft moderation (hidden)
   ───────────────────────────────────────────────────────────────── */
test('hidden: suppresses lifecycle + promotion; urgency still renders', () => {
  const plan = resolveBadgePlan({
    moderation: 'hidden',
    urgency: 'warning',
    lifecycle: 'open',
    promotions: ['featured'],
    labels: labelsFor(['hidden', 'warning', 'open', 'featured']),
  })
  assert.deepEqual(stateKeys(plan.topRail).sort(), ['hidden'].sort())
  assert.equal(plan.lifecycleUrgencyDot, 'warning')
  assert.equal(plan.suppressed, true)
  assert.equal(plan.featuredRing, false)
  assert.equal(stateKeys(plan.meta).includes('featured'), false)
})

/* ─────────────────────────────────────────────────────────────────
   3. Moderation promotion-only suppression
   ───────────────────────────────────────────────────────────────── */
test('pending/locked/flagged/restricted: keep lifecycle, suppress promotion', () => {
  for (const mod of ['pending', 'locked', 'flagged', 'restricted'] as ModerationState[]) {
    const plan = resolveBadgePlan({
      moderation: mod,
      lifecycle: 'open',
      promotions: ['featured', 'boosted'],
      labels: labelsFor([mod, 'open', 'featured', 'boosted']),
    })
    assert.ok(stateKeys(plan.topRail).includes(mod), `${mod}: moderation pill missing`)
    assert.ok(stateKeys(plan.topRail).includes('open'), `${mod}: lifecycle pill missing`)
    assert.equal(plan.featuredRing, false, `${mod}: featuredRing must be false`)
    const allPills = [...plan.topRail, ...plan.meta]
    for (const prom of ALL_PROMOTION) {
      assert.equal(
        stateKeys(allPills).includes(prom),
        false,
        `${mod}: promotion "${prom}" must be suppressed`,
      )
    }
  }
})

/* ─────────────────────────────────────────────────────────────────
   4. Urgency × lifecycle
   ───────────────────────────────────────────────────────────────── */
test('urgent takes top rail, lifecycle slips to meta', () => {
  const plan = resolveBadgePlan({
    urgency: 'urgent',
    lifecycle: 'open',
    labels: labelsFor(['urgent', 'open']),
  })
  assert.deepEqual(stateKeys(plan.topRail), ['urgent'])
  assert.deepEqual(stateKeys(plan.meta), ['open'])
  assert.equal(plan.lifecycleUrgencyDot, null)
})

test('emergency takes top rail, lifecycle slips to meta', () => {
  const plan = resolveBadgePlan({
    urgency: 'emergency',
    lifecycle: 'in-progress',
    labels: labelsFor(['emergency', 'in-progress']),
  })
  assert.deepEqual(stateKeys(plan.topRail), ['emergency'])
  assert.deepEqual(stateKeys(plan.meta), ['in-progress'])
})

test('warning urgency renders as a dot beside lifecycle', () => {
  const plan = resolveBadgePlan({
    urgency: 'warning',
    lifecycle: 'in-progress',
    labels: labelsFor(['warning', 'in-progress']),
  })
  assert.deepEqual(stateKeys(plan.topRail), ['in-progress'])
  assert.equal(plan.lifecycleUrgencyDot, 'warning')
})

test('info urgency renders as a dot EXCEPT when lifecycle=open (redundant)', () => {
  const withSold = resolveBadgePlan({
    urgency: 'info',
    lifecycle: 'sold',
    labels: labelsFor(['info', 'sold']),
  })
  assert.equal(withSold.lifecycleUrgencyDot, 'info')

  const withOpen = resolveBadgePlan({
    urgency: 'info',
    lifecycle: 'open',
    labels: labelsFor(['info', 'open']),
  })
  assert.equal(withOpen.lifecycleUrgencyDot, null)
})

/* ─────────────────────────────────────────────────────────────────
   5. Terminal lifecycles suppress promotion
   ───────────────────────────────────────────────────────────────── */
test('terminal lifecycles suppress ALL promotion', () => {
  for (const life of TERMINAL_LIFECYCLE) {
    const plan = resolveBadgePlan({
      lifecycle: life,
      promotions: ['featured', 'boosted', 'pinned'],
      labels: labelsFor([life, 'featured', 'boosted', 'pinned']),
    })
    assert.equal(plan.featuredRing, false, `${life}: featuredRing must be false`)
    const allPills = [...plan.topRail, ...plan.meta]
    for (const prom of ALL_PROMOTION) {
      assert.equal(
        stateKeys(allPills).includes(prom),
        false,
        `${life}: promotion "${prom}" must be suppressed`,
      )
    }
    assert.ok(stateKeys(plan.topRail).includes(life), `${life}: lifecycle pill missing`)
  }
})

/* ─────────────────────────────────────────────────────────────────
   6. Promotion precedence
   ───────────────────────────────────────────────────────────────── */
test('boosted beats featured; pinned coexists', () => {
  assert.deepEqual(resolvePromotions(['featured']), ['featured'])
  assert.deepEqual(resolvePromotions(['boosted']), ['boosted'])
  assert.deepEqual(resolvePromotions(['featured', 'boosted']), ['boosted'])
  assert.deepEqual(resolvePromotions(['featured', 'pinned']), ['featured', 'pinned'])
  assert.deepEqual(resolvePromotions(['boosted', 'pinned']), ['boosted', 'pinned'])
  assert.deepEqual(resolvePromotions(['featured', 'boosted', 'pinned']), ['boosted', 'pinned'])
})

test('promotion primary owns top-rail slot, secondary (pinned) drops to meta', () => {
  const plan = resolveBadgePlan({
    lifecycle: 'open',
    promotions: ['boosted', 'pinned'],
    labels: labelsFor(['open', 'boosted', 'pinned']),
  })
  assert.ok(stateKeys(plan.topRail).includes('boosted'))
  assert.ok(stateKeys(plan.meta).includes('pinned'))
  assert.equal(plan.featuredRing, true)
})

test('featured-only sets featuredRing', () => {
  const plan = resolveBadgePlan({
    lifecycle: 'open',
    promotions: ['featured'],
    labels: labelsFor(['open', 'featured']),
  })
  assert.equal(plan.featuredRing, true)
})

test('pinned-only does NOT set featuredRing', () => {
  const plan = resolveBadgePlan({
    lifecycle: 'open',
    promotions: ['pinned'],
    labels: labelsFor(['open', 'pinned']),
  })
  assert.ok(stateKeys(plan.topRail).includes('pinned'))
  assert.equal(plan.featuredRing, false)
})

/* ─────────────────────────────────────────────────────────────────
   7. Edge cases from the brief
   ───────────────────────────────────────────────────────────────── */
test('edge: urgent + sold + featured — sold+urgent render, promotion suppressed', () => {
  const plan = resolveBadgePlan({
    urgency: 'urgent',
    lifecycle: 'sold',
    promotions: ['featured'],
    labels: labelsFor(['urgent', 'sold', 'featured']),
  })
  // Urgency owns top rail; lifecycle to meta; promotion gone.
  assert.deepEqual(stateKeys(plan.topRail), ['urgent'])
  assert.deepEqual(stateKeys(plan.meta), ['sold'])
  assert.equal(plan.featuredRing, false)
  assert.equal(plan.suppressed, false)
})

test('edge: hidden + boosted + pinned + urgent — only hidden + urgent survive', () => {
  const plan = resolveBadgePlan({
    moderation: 'hidden',
    urgency: 'urgent',
    lifecycle: 'open',
    promotions: ['boosted', 'pinned'],
    labels: labelsFor(['hidden', 'urgent', 'open', 'boosted', 'pinned']),
  })
  const allPills = [...plan.topRail, ...plan.meta]
  for (const forbidden of ['boosted', 'pinned', 'open']) {
    assert.equal(
      stateKeys(allPills).includes(forbidden),
      false,
      `hidden + urgent should suppress "${forbidden}"`,
    )
  }
  assert.ok(stateKeys(plan.topRail).includes('hidden'))
  assert.ok(stateKeys(plan.topRail).includes('urgent'))
  assert.equal(plan.suppressed, true)
})

test('edge: pending + boosted + open — no promotion, lifecycle survives', () => {
  const plan = resolveBadgePlan({
    moderation: 'pending',
    lifecycle: 'open',
    promotions: ['boosted'],
    labels: labelsFor(['pending', 'open', 'boosted']),
  })
  const allPills = [...plan.topRail, ...plan.meta]
  assert.equal(stateKeys(allPills).includes('boosted'), false)
  assert.ok(stateKeys(plan.topRail).includes('pending'))
  assert.ok(stateKeys(plan.topRail).includes('open'))
})

/* ─────────────────────────────────────────────────────────────────
   8. Density caps
   ───────────────────────────────────────────────────────────────── */
test('top rail never exceeds 3 pills, even under adversarial input', () => {
  const plan = resolveBadgePlan({
    moderation: 'flagged',
    urgency: 'urgent',
    lifecycle: 'in-progress',
    promotions: ['boosted', 'pinned'],
    labels: labelsFor(['flagged', 'urgent', 'in-progress', 'boosted', 'pinned']),
  })
  assert.ok(plan.topRail.length <= 3, `topRail was ${plan.topRail.length}, must be ≤ 3`)
})

/* ─────────────────────────────────────────────────────────────────
   9. Missing labels → pill skipped (graceful)
   ───────────────────────────────────────────────────────────────── */
test('missing labels skip the pill rather than throwing', () => {
  const plan = resolveBadgePlan({
    lifecycle: 'open',
    promotions: ['featured'],
    labels: { featured: 'FEATURED' }, // no 'open' label
  })
  assert.equal(stateKeys(plan.topRail).includes('open'), false)
  assert.ok(stateKeys(plan.topRail).includes('featured'))
})

/* ─────────────────────────────────────────────────────────────────
   10. Coverage — every state rendered at least once
   ───────────────────────────────────────────────────────────────── */
test('coverage: every moderation state resolves to a pill', () => {
  for (const mod of ALL_MODERATION) {
    const plan = resolveBadgePlan({
      moderation: mod,
      labels: labelsFor([mod]),
    })
    assert.ok(
      stateKeys(plan.topRail).includes(mod),
      `moderation "${mod}" produced no pill`,
    )
  }
})

test('coverage: every urgency state resolves (top rail OR dot)', () => {
  for (const u of ALL_URGENCY) {
    const plan = resolveBadgePlan({
      urgency: u,
      lifecycle: 'in-progress',
      labels: labelsFor([u, 'in-progress']),
    })
    const visible =
      stateKeys(plan.topRail).includes(u) || plan.lifecycleUrgencyDot === u
    assert.ok(visible, `urgency "${u}" produced no pill and no dot`)
  }
})

test('coverage: every lifecycle state resolves to a pill', () => {
  for (const life of ALL_LIFECYCLE) {
    const plan = resolveBadgePlan({
      lifecycle: life,
      labels: labelsFor([life]),
    })
    const anywhere = [...plan.topRail, ...plan.meta].map((p) => p.state)
    assert.ok(anywhere.includes(life), `lifecycle "${life}" produced no pill`)
  }
})

test('coverage: every promotion state is reachable under open lifecycle', () => {
  for (const prom of ALL_PROMOTION) {
    const plan = resolveBadgePlan({
      lifecycle: 'open',
      promotions: [prom],
      labels: labelsFor(['open', prom]),
    })
    const anywhere = [...plan.topRail, ...plan.meta].map((p) => p.state)
    assert.ok(anywhere.includes(prom), `promotion "${prom}" not reachable`)
  }
})

/* ─────────────────────────────────────────────────────────────────
   11. Trust resolvers
   ───────────────────────────────────────────────────────────────── */
test('identity priority: admin > mod > verified > provider', () => {
  assert.equal(resolveIdentity({ role: 'SUPER_ADMIN' }), 'admin')
  assert.equal(resolveIdentity({ role: 'NEIGHBORHOOD_MOD' }), 'mod')
  assert.equal(resolveIdentity({ role: 'PLATFORM_MOD' }), 'mod')
  assert.equal(resolveIdentity({ accountType: 'VERIFIED_PROVIDER' }), 'verified')
  assert.equal(
    resolveIdentity({ accountType: 'SERVICE_PROVIDER', providerStatus: 'ACTIVE' }),
    'provider',
  )
  assert.equal(
    resolveIdentity({ accountType: 'SERVICE_PROVIDER', providerStatus: 'VERIFIED' }),
    'provider',
  )
  // Pending providers must NOT surface publicly.
  assert.equal(
    resolveIdentity({ accountType: 'SERVICE_PROVIDER', providerStatus: 'PENDING' }),
    null,
  )
  // Role outranks account type.
  assert.equal(
    resolveIdentity({ role: 'SUPER_ADMIN', accountType: 'VERIFIED_PROVIDER' }),
    'admin',
  )
})

test('tier ladder + visibility', () => {
  assert.equal(resolveTier(0), 'new')
  assert.equal(resolveTier(49), 'new')
  assert.equal(resolveTier(50), 'active')
  assert.equal(resolveTier(149), 'active')
  assert.equal(resolveTier(150), 'trusted')
  assert.equal(resolveTier(399), 'trusted')
  assert.equal(resolveTier(400), 'distinguished')
  assert.equal(resolveTier(9_999), 'distinguished')
  assert.equal(tierIsVisible('new'), false)
  assert.equal(tierIsVisible('active'), true)
  assert.equal(tierIsVisible('trusted'), true)
  assert.equal(tierIsVisible('distinguished'), true)
})

test('trust plan aggregates identity + tier', () => {
  const p = resolveTrustPlan({
    role: 'NEIGHBORHOOD_MOD',
    accountType: 'VERIFIED_PROVIDER',
    reputation: 500,
  })
  assert.equal(p.identity, 'mod')
  assert.equal(p.tier, 'distinguished')
  assert.equal(p.showTier, true)

  const newbie = resolveTrustPlan({ reputation: 10 })
  assert.equal(newbie.identity, null)
  assert.equal(newbie.tier, 'new')
  assert.equal(newbie.showTier, false)
})

/* ─────────────────────────────────────────────────────────────────
   12. Null/empty input — well-defined no-op
   ───────────────────────────────────────────────────────────────── */
test('empty input produces an empty plan', () => {
  const plan = resolveBadgePlan({})
  assert.deepEqual(plan.topRail, [])
  assert.deepEqual(plan.meta, [])
  assert.equal(plan.lifecycleUrgencyDot, null)
  assert.equal(plan.featuredRing, false)
  assert.equal(plan.suppressed, false)
})

test('undefined promotions array is safe', () => {
  const plan = resolveBadgePlan({ lifecycle: 'open', labels: { open: 'OPEN' } })
  assert.deepEqual(stateKeys(plan.topRail), ['open'])
})

test('empty promotions array does not produce featuredRing', () => {
  const plan = resolveBadgePlan({
    lifecycle: 'open',
    promotions: [],
    labels: { open: 'OPEN' },
  })
  assert.equal(plan.featuredRing, false)
})

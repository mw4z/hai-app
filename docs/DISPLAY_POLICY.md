# Display Policy

**Status:** Active (Pass 9 spec · Pass 10 enforced)
**Scope:** Every UI surface that renders product-state badges, pills, rings, or dots.
**Authority:** `src/lib/display-policy.ts` is the single source of truth. This document is a product-facing extract; the code is canonical.

---

## Layer model (recap)

| Layer | What it is | Source |
| --- | --- | --- |
| 1 — Tokens | Raw color/space/z/motion scales | `src/app/design-tokens.css` (top) |
| 2 — Primitives | `.hai-state-badge`, `.hai-category-badge`, `.hai-card`, … | `src/app/design-tokens.css` |
| 3 — Product cards | `MarketplaceCard`, `ProviderCard`, `ListingStatusRow`, `PromotionRibbon`, `PostCard` | `src/components/*` |
| **4 — Policy** | **`resolveBadgePlan`, `resolvePromotions`, `resolveIdentity`, `resolveTier`** | **`src/lib/display-policy.ts`** |
| 5 — Render helper | `<StatePill>`, `<StateDot>` — the only renderers of `.hai-state-*` | `src/lib/state-render.tsx` |

Cards **never** decide visuals themselves. They call the policy, then hand the returned plan to the render helper.

---

## 1. Priority order between semantic families

Highest → lowest:

1. **Moderation** — `removed`, `hidden`, `locked`, `flagged`, `restricted`, `pending`
2. **Urgency** — `emergency`, `urgent`, `warning`, `info`
3. **Lifecycle** — `open`, `in-progress`, `awaiting`, `confirmed`, `en-route`, `arrived`, `resolved`, `closed`, `sold`, `expired`, `unavailable`, `disputed`, `cancelled`
4. **Promotion** — `featured`, `boosted`, `pinned`
5. **Trust** — `admin` > `mod` > `verified` > `provider` (plus tier: `distinguished` > `trusted` > `active` > `new`)

---

## 2. Coexistence matrix

| Condition | Visible | Suppressed |
| --- | --- | --- |
| `moderation = removed` | only the `removed` badge | **everything else**, body content hidden |
| `moderation = hidden` | `hidden` + urgency (if any) | lifecycle, promotion, body |
| `moderation ∈ {locked, flagged, restricted, pending}` | moderation + urgency + lifecycle | **all** promotion |
| `urgency ∈ {urgent, emergency}` | urgency owns the top rail | lifecycle demoted to the meta row |
| `urgency ∈ {warning, info}` | urgency renders as a dot prepended to the lifecycle label | never its own pill |
| `urgency = info` + `lifecycle = open` | (redundant) | urgency hidden |
| `lifecycle ∈ {sold, closed, expired, unavailable, cancelled, resolved}` | lifecycle | **all** promotion |

---

## 3. Density caps

| Region | Cap |
| --- | --- |
| Top rail (card header) | ≤ 3 pills: 1 moderation + 1 urgency/lifecycle + 1 promotion |
| Trust rail (inline with username) | ≤ 1 identity pill + ≤ 1 tier badge |
| Promotion ribbon | ≤ 2 pills (primary + optional `pinned`) |
| Overflow | Moves to `plan.meta`; never a 4th pill in the header |

---

## 4. Promotion precedence

- `boosted` > `featured` (mutually exclusive — always boosted when both set)
- `pinned` coexists with either
- `.hai-featured-ring` applies when primary ∈ {`boosted`, `featured`}. Pinned-only gets **no** ring.
- Any promotion hides when suppression rules (moderation / terminal lifecycle) kick in.

---

## 5. Trust display

| Key | Rank | When it shows |
| --- | --- | --- |
| `admin` | 1 | `role = SUPER_ADMIN` |
| `mod` | 2 | `role = NEIGHBORHOOD_MOD` \| `PLATFORM_MOD` |
| `verified` | 3 | `accountType = VERIFIED_PROVIDER` |
| `provider` | 4 | `accountType = SERVICE_PROVIDER` AND `providerStatus ∈ {ACTIVE, VERIFIED}` |

`providerStatus = PENDING` **never** surfaces publicly.

Tier ladder: `distinguished` ≥ 400 rep • `trusted` ≥ 150 • `active` ≥ 50 • `new` < 50 (never renders).

---

## 6. Lifecycle display

- Default: lifecycle pill in the top rail.
- With `warning`/`info` urgency: urgency dot prepended to the lifecycle label.
- With `urgent`/`emergency` urgency: urgency pill takes top rail; lifecycle moves to the meta row.
- With `moderation ∈ {hidden, removed}`: lifecycle hidden entirely.

---

## 7. Enforcement

### Central helper

Only `src/lib/state-render.tsx` may produce `.hai-state-badge` / `.hai-state-dot` DOM. Consumers import:

```tsx
import { StatePill, StateDot } from '@/lib/state-render'

<StatePill state="sold" label="Sold" />
<StatePill pill={planPill} />          // from resolveBadgePlan
<StateDot   state="warning" />          // urgency-beside-lifecycle
```

### Static guardrail

```bash
npm run lint:state-badges
```

Scans `src/` for direct usage of `.hai-state-badge` / `.hai-state-dot` outside the allow-list. Exit code ≠ 0 is a policy violation.

### Exhaustive state union

`state-render.tsx` uses a `stateFamily()` switch with a `never` exhaustive check. Adding a new state to the policy union without classifying its family produces a TypeScript error — new states **cannot** silently enter the UI.

### Unit tests

```bash
npm run test:policy
```

27 tests cover:
- Every moderation, urgency, lifecycle, and promotion state reaches a pill
- Coexistence rules (removed-suppresses-all, hidden-suppresses-promotion+lifecycle, pending-suppresses-promotion-only, etc.)
- Edge cases (`urgent + sold + featured`, `hidden + boosted + pinned + urgent`, etc.)
- Density cap (top rail ≤ 3) under adversarial input
- Promotion precedence (`boosted` wins; `pinned` coexists; `featuredRing` flag)
- Missing-label graceful degrade
- Identity priority and tier ladder
- Empty / null-safe input

---

## 8. Forbidden patterns

| Pattern | Why it's banned |
| --- | --- |
| `<span className="hai-state-badge">` | Bypasses the policy; caught by `npm run lint:state-badges`. |
| Hand-coded conditionals picking badge colors | Reintroduces drift; policy must decide. |
| Adding a state without updating `stateFamily()` | TS error by design; do not silence with `as any`. |
| Manual stacking of two `.hai-state-badge`s in the same JSX container outside a `plan.topRail`/`plan.meta` loop | Circumvents density caps. Use `resolveBadgePlan`. |
| Rendering a state pill inside another state pill | Use `StateDot` inside the label child if you need a leading dot; never nest pills. |
| Applying `.hai-featured-ring` to a card without consulting `plan.featuredRing` | Ring should never outlive the promotion that justifies it. |

---

## 9. Adding a new state

1. Add the new state to the appropriate type union in `src/lib/display-policy.ts`.
2. Add a token pair (`--hai-state-<name>-bg` + `-fg`, plus dark override) in `src/app/design-tokens.css`.
3. Add the matching `.hai-state-badge[data-state="<name>"]` rule in the component-primitives section.
4. Classify the new state in `stateFamily()` in `src/lib/state-render.tsx` — TypeScript will refuse to compile until this is done.
5. Extend `resolveBadgePlan`'s rules if the new state participates in suppression or precedence (e.g. a new terminal lifecycle).
6. Add a test case in `src/lib/display-policy.test.ts`.
7. Run `npm run test:policy && npm run lint:state-badges && npx tsc --noEmit`.

All three must pass. No shortcuts.

---

## 10. Change log

- **Pass 7** — semantic state token layer defined.
- **Pass 8** — MarketplaceCard / ProviderCard / ListingStatusRow / PromotionRibbon composed from primitives.
- **Pass 9** — `display-policy.ts` authored; cards routed through `resolveBadgePlan`.
- **Pass 10** — `<StatePill>` / `<StateDot>` enforcement helper, `stateFamily()` exhaustive check, 27 unit tests, `lint:state-badges` guardrail, this document.

# HAI Rides — Targeted Revision (v3)

---

## 1. What Changes From Current Implementation

| Area | Current | Revised | Files Affected |
|------|---------|---------|----------------|
| State machine | 10 states, mark_done is a timestamp on IN_PROGRESS | 11 states, RIDE_PENDING_COMPLETION is explicit | state-machine.ts, status/route.ts, cron/rides/route.ts, schema.prisma |
| Auto-close semantics | Same rep reward as requester-confirmed | Lower rep, flagged for review, dispute window | status/route.ts, cron/rides/route.ts, rate/route.ts |
| Driver stale timeouts | Only SELECTED has timeout | CONFIRMED (20min), EN_ROUTE (45min), IN_PROGRESS (3hr) added | cron/rides/route.ts, state-machine.ts |
| Offer editing | Not supported | Editable while RIDE_OPEN, logged as OFFER_UPDATED | offers/route.ts, events.ts |
| Scheduled expiry | Hard 30min before | Flexible mode: open until scheduledAt, then 15min grace | rides/route.ts, cron/rides/route.ts |
| Race error contract | Generic 409 | Structured error codes + refresh hint | All mutation endpoints |
| Reputation | Flat +25/+5 for all completions | Tiered by completion mode and cancel context | status/route.ts, cron/rides/route.ts |

**Not changing:** Models, RideEvent append-only, write-once timestamps, privacy model, atomic selection/confirmation, bilingual notifications, RideMessage, RideRating, RideDispute structure.

---

## 2. Updated State / Phase Design

### New State: RIDE_PENDING_COMPLETION

Added between IN_PROGRESS and COMPLETED.

```
RIDE_IN_PROGRESS  →  RIDE_PENDING_COMPLETION  →  RIDE_COMPLETED
                     (driver marks done)         (requester confirms OR auto-close)
```

### Full State List (11 states)

```
RIDE_OPEN
RIDE_SELECTED
RIDE_CONFIRMED
RIDE_EN_ROUTE
RIDE_ARRIVED
RIDE_IN_PROGRESS
RIDE_PENDING_COMPLETION   ← NEW
RIDE_COMPLETED
RIDE_CANCELLED
RIDE_EXPIRED
RIDE_DISPUTED
```

### Updated Transition Table

| # | From | To | Actor | Timestamp Set |
|---|------|----|-------|---------------|
| T1 | OPEN | SELECTED | requester | selectedAt |
| T2 | SELECTED | CONFIRMED | driver | confirmedAt (Trip created) |
| T3 | SELECTED | OPEN | system | selectedAt→null (5min timeout) |
| T4 | CONFIRMED | EN_ROUTE | driver | enRouteAt |
| T5 | CONFIRMED | CANCELLED | system | cancelledAt (20min stale timeout) |
| T6 | EN_ROUTE | ARRIVED | driver | arrivedAt |
| T7 | EN_ROUTE | CANCELLED | system | cancelledAt (45min stale timeout) |
| T8 | ARRIVED | IN_PROGRESS | driver | startedAt |
| T9 | ARRIVED | CANCELLED | system | cancelledAt (10min no-show) |
| T10 | IN_PROGRESS | PENDING_COMPLETION | driver | driverMarkedDoneAt |
| T11 | IN_PROGRESS | CANCELLED | system | cancelledAt (3hr stale timeout) |
| T12 | PENDING_COMPLETION | COMPLETED | requester | requesterConfirmedDoneAt, completedAt, mode=REQUESTER_CONFIRMED |
| T13 | PENDING_COMPLETION | COMPLETED | system | completedAt, mode=AUTO_CLOSED (15min) |
| T14 | PENDING_COMPLETION | DISPUTED | either | — (RideDispute created) |
| T15 | OPEN | CANCELLED | requester | — |
| T16 | SELECTED | CANCELLED | requester | — |
| T17 | CONFIRMED | CANCELLED | either | cancelledAt |
| T18 | EN_ROUTE | CANCELLED | either | cancelledAt |
| T19 | ARRIVED | CANCELLED | either | cancelledAt |
| T20 | IN_PROGRESS | CANCELLED | either | cancelledAt |
| T21 | PENDING_COMPLETION | CANCELLED | either | cancelledAt |
| T22 | OPEN | EXPIRED | system | — |
| T23 | DISPUTED | COMPLETED | admin | completedAt |
| T24 | DISPUTED | CANCELLED | admin | cancelledAt |

**Key changes from v2:**
- T10: IN_PROGRESS → PENDING_COMPLETION (was "no state change" with timestamp)
- T12/T13: from PENDING_COMPLETION (was from IN_PROGRESS)
- T14: dispute from PENDING_COMPLETION (new)
- T5, T7, T11: driver stale timeouts (new)
- T21: cancel from PENDING_COMPLETION (new)

### API Response for PENDING_COMPLETION

The ride detail and poll endpoints now return the explicit state:

```json
{
  "status": "RIDE_PENDING_COMPLETION",
  "trip": {
    "driverMarkedDoneAt": "2026-03-26T14:30:00Z",
    "autoCloseAt": "2026-03-26T14:45:00Z"
  }
}
```

No client inference needed. The state is the source of truth.

---

## 3. Updated Timeout Matrix

| # | Source State | Timeout | Duration | Action | Penalty | Reopen? |
|---|-------------|---------|----------|--------|---------|---------|
| 1 | SELECTED | confirmDeadline | 5 min | → OPEN, offer→PASSED | Driver: +1 no-confirm count | Yes |
| 2 | CONFIRMED | confirmedAt + 20min | 20 min | → CANCELLED | Driver: -5 rep, +1 cancelCount | No (requester notified to re-post) |
| 3 | EN_ROUTE | enRouteAt + 45min | 45 min | → CANCELLED, flag as suspicious | Driver: -10 rep, +1 cancelCount, flagged for admin | No |
| 4 | ARRIVED | arrivedAt + 10min | 10 min | → CANCELLED | Requester: -5 rep | No |
| 5 | IN_PROGRESS | startedAt + 3hr | 3 hr | → DISPUTED (not cancelled) | None (admin reviews) | No |
| 6 | PENDING_COMPLETION | driverMarkedDoneAt + 15min | 15 min | → COMPLETED (AUTO_CLOSED) | None | No |
| 7 | OPEN (immediate) | createdAt + 2hr | 2 hr | → EXPIRED | None | No |
| 8 | OPEN (scheduled) | scheduledAt + 15min | see §6 | → EXPIRED | None | No |

### Design rationale for new timeouts:

**#2 — CONFIRMED stale (20 min):**
Driver confirmed but never went EN_ROUTE. Likely changed their mind or forgot. 20 minutes is generous enough for "getting to the car" but short enough to not waste requester's time. Penalty is moderate (-5 rep) because they did accept then abandon.

**#3 — EN_ROUTE stale (45 min):**
Driver said they're coming but never arrived. 45 minutes covers most realistic urban/inter-city drives. If a driver says "on the way" and vanishes for 45 minutes, it's suspicious. Higher penalty (-10 rep) and flagged for admin review. The flag means: `RideEvent` with eventType `STALE_CANCEL` and metadata `{ suspicious: true }`.

**#5 — IN_PROGRESS stale (3 hr):**
Trip started but never completed or marked done after 3 hours. This is unusual — could be a long trip, or both parties forgot. Instead of auto-cancelling (which would be unfair if the trip is actually happening), it moves to DISPUTED for admin review. No automatic penalty.

### Cron execution order (updated):

```
1. SELECTED confirm timeouts (5 min)
2. CONFIRMED stale (20 min)
3. EN_ROUTE stale (45 min)
4. ARRIVED no-show (10 min)
5. IN_PROGRESS stale (3 hr) → DISPUTED
6. PENDING_COMPLETION auto-close (15 min)
7. OPEN expiry (2hr / scheduledAt+15min)
```

---

## 4. Offer Edit Policy

### Rules

| Rule | Value |
|------|-------|
| Edits allowed? | Yes |
| How many edits? | Unlimited while ride is OPEN |
| Until when? | Only while ride status = RIDE_OPEN |
| submittedAt | Immutable, never changes |
| updatedAt | New field, changes on each edit |
| What's editable? | price, arrivalMin, message |
| Requester sees? | Latest version only |
| Event logged? | Yes, OFFER_UPDATED with old + new values |

### Implementation

**RideOffer model change:**
```prisma
// Add to RideOffer:
  updatedAt       DateTime    @updatedAt
  editCount       Int         @default(0)
```

**API: PATCH /api/rides/[id]/offers**

New endpoint (same file as POST):

```
PATCH /api/rides/{rideId}/offers
Auth: driver who owns the offer
Condition: ride.status === 'RIDE_OPEN'

Request:
{
  price?: number,       // optional, same validation as create
  arrivalMin?: number,  // optional, 1-120
  message?: string      // optional, max 100
}

Response 200:
{
  id, price, arrivalMin, message, editCount, updatedAt
}

Errors:
- 409 if ride not OPEN
- 404 if no existing offer
- 400 if validation fails
```

**Event logged:**
```json
{
  "eventType": "OFFER_UPDATED",
  "actorType": "driver",
  "metadata": {
    "offerId": "...",
    "before": { "price": 20, "arrivalMin": 8 },
    "after": { "price": 18, "arrivalMin": 8 },
    "editCount": 2
  }
}
```

**Requester notification on edit:**
Only if price decreased (beneficial change). No notification for arrival time or message edits.

---

## 5. Revised Reputation Rules

### Completion Rewards

| Completion Mode | Driver Rep | Requester Rep | Notes |
|----------------|-----------|--------------|-------|
| REQUESTER_CONFIRMED | +25 | +5 | Full trust — both parties agree |
| AUTO_CLOSED | +15 | +0 | Reduced trust — requester didn't confirm. Driver still gets credit but less. Requester gets nothing (didn't engage) |
| Disputed → resolved as COMPLETED | +10 | +0 | Lowest trust — admin had to intervene |
| Disputed → resolved as CANCELLED | 0 | 0 | No reward, penalties per admin discretion |

### Rating Rules by Completion Mode

| Completion Mode | Ratings allowed? | Rating weight | Notes |
|----------------|-----------------|---------------|-------|
| REQUESTER_CONFIRMED | Both can rate, 72hr window | 1.0x (full weight) | Standard flow |
| AUTO_CLOSED | Both can rate, 48hr window (shorter) | 0.7x (reduced weight) | Requester didn't confirm, so their non-rating is itself a signal. If they do rate, it carries less weight |
| Disputed → completed | Only after resolution, 48hr window | 0.5x (half weight) | Admin resolved, ratings are less reliable indicators |

### Dispute Eligibility After AUTO_CLOSED

- **Grace window:** 24 hours after auto-close
- **How:** User calls `/api/rides/[id]/status` with `action: "dispute"` even though status is COMPLETED
- **Condition:** `completionMode === 'AUTO_CLOSED'` AND `completedAt + 24hr > now`
- **Result:** Status reverts COMPLETED → DISPUTED

This means: T14 (PENDING_COMPLETION → DISPUTED) covers pre-close disputes, and a new T25 (COMPLETED → DISPUTED) covers post-auto-close disputes within 24hr.

### Cancellation Penalties (Refined)

| Scenario | Who | Rep | Cancel Count | Notes |
|----------|-----|-----|-------------|-------|
| Requester cancels from OPEN | Requester | 0 | — | Free |
| Requester cancels from SELECTED | Requester | 0 | — | Free (pre-confirm) |
| Requester cancels from CONFIRMED | Requester | -5 | — | Driver already committed |
| Requester cancels from EN_ROUTE | Requester | -10 | — | Driver already driving |
| Requester cancels from ARRIVED | Requester | -10 | — | Driver waiting |
| Requester cancels from IN_PROGRESS | Requester | -15 | — | Mid-trip cancel |
| Requester no-show at ARRIVED (system) | Requester | -5 | — | 10min timeout |
| Driver cancels from CONFIRMED | Driver | -5 | +1 | Accepted then backed out |
| Driver cancels from EN_ROUTE | Driver | -10 | +1 | Was driving, gave up |
| Driver cancels from ARRIVED | Driver | -10 | +1 | At pickup, abandoned |
| Driver cancels from IN_PROGRESS | Driver | -15 | +1 | Mid-trip abandon |
| Driver stale at CONFIRMED (system) | Driver | -5 | +1 | Never went EN_ROUTE |
| Driver stale at EN_ROUTE (system) | Driver | -10 | +1 | Suspicious, flagged |
| IN_PROGRESS stale → DISPUTED (system) | None | 0 | 0 | Admin decides |

### Analytics Tracking

Every completion and cancellation logs to RideEvent with metadata including:
```json
{
  "completionMode": "AUTO_CLOSED",
  "repAwarded": { "driver": 15, "requester": 0 },
  "ratingWeight": 0.7,
  "autoCloseReason": "15min_timeout"
}
```

This enables dashboards to track: % auto-closed, % requester-confirmed, % disputed, completion rate by driver, etc.

---

## 6. Scheduled Ride Expiry Decision

### Options Considered

| Option | Rule | Pro | Con |
|--------|------|-----|-----|
| **Strict** | Expire at scheduledAt - 30min | Ensures driver has 30min to prepare | Kills late offers; punishes slow markets |
| **Flexible** | Remain open until scheduledAt | Maximum offer window | Offers arriving at departure time are useless |
| **Grace** | Open until scheduledAt + 15min, then expire | Covers late arrivals; still time-bounded | Could confuse: "my scheduled ride is past time but still open?" |

### Decision: Flexible with grace (Option 3, modified)

**Rule for V1:**
```
Scheduled rides expire at scheduledAt + 15 minutes.
```

**Rationale:**
- The scheduled time is the *departure intent*, not a hard deadline
- In Saudi culture, "6:00 AM" often means "around 6"
- A 15-minute grace covers realistic lateness without extending indefinitely
- If no driver is selected by scheduledAt + 15min, the ride clearly failed and should expire

**Feed visibility:**
- Scheduled rides appear in feed starting at `scheduledAt - 2 hours`
- They remain visible until expiry

**What this changes in code:**
```typescript
// rides/route.ts — POST create
if (!isImmediate) {
  expiresAt = new Date(new Date(scheduledAt).getTime() + 15 * 60 * 1000)
}
```

One-line change. Cron handles the rest (same OPEN → EXPIRED logic).

---

## 7. API Error Contract for Race / Stale Cases

### Error Response Format

All ride mutation endpoints return race/stale errors with this structure:

```json
{
  "error": "RIDE_ALREADY_SELECTED",
  "message": "تم اختيار سائق بالفعل",
  "messageEn": "A driver has already been selected",
  "shouldRefresh": true,
  "currentStatus": "RIDE_SELECTED"
}
```

### Error Code Table

| Code | HTTP | Trigger | Arabic | English | shouldRefresh |
|------|------|---------|--------|---------|--------------|
| `RIDE_NOT_OPEN` | 409 | Submit offer on non-OPEN ride | الطلب لم يعد يقبل عروض | Ride no longer accepting offers | true |
| `RIDE_ALREADY_SELECTED` | 409 | Select offer but someone else won | تم اختيار عرض بالفعل | An offer was already selected | true |
| `RIDE_SELECTION_EXPIRED` | 409 | Select but ride moved to EXPIRED | انتهت صلاحية الطلب | Ride request expired | true |
| `CONFIRM_DEADLINE_PASSED` | 409 | Confirm after 5min deadline | انتهت مهلة التأكيد | Confirmation deadline passed | true |
| `RIDE_REOPENED` | 409 | Confirm but ride was reopened (timeout) | تم إعادة فتح الطلب — مهلتك انتهت | Ride reopened — your deadline passed | true |
| `INVALID_TRANSITION` | 409 | Any illegal state change | لا يمكن تنفيذ هذا الإجراء الآن | Cannot perform this action now | true |
| `ALREADY_OFFERED` | 409 | Submit second offer | لديك عرض على هذا الطلب بالفعل | You already have an offer on this ride | false |
| `ALREADY_RATED` | 409 | Rate same trip twice | قيّمت هذه الرحلة بالفعل | Already rated this trip | false |
| `RATING_WINDOW_CLOSED` | 410 | Rate after 72hr (or 48hr) | انتهت مهلة التقييم | Rating window closed | false |
| `TIMESTAMP_ALREADY_SET` | 409 | Write-once violation | تم تسجيل هذه المرحلة مسبقاً | This phase was already recorded | true |
| `NOT_PARTICIPANT` | 403 | Non-participant tries to act | ليس لديك صلاحية | You are not a participant | false |
| `OFFER_NOT_EDITABLE` | 409 | Edit offer on non-OPEN ride | لا يمكن تعديل العرض بعد بدء الاختيار | Cannot edit offer after selection started | true |

### Client Contract

When `shouldRefresh: true`, the client must:
1. Show the error message as a toast
2. Re-fetch ride data via `GET /api/rides/[id]` or `/api/rides/[id]/poll`
3. Update UI to reflect new state

This prevents stale UI from allowing impossible actions.

---

## 8. Implementation Diff Plan

### File: `prisma/schema.prisma`

**Changes:**
- Add `RIDE_PENDING_COMPLETION` to `RideStatus` enum
- Add `updatedAt` and `editCount` fields to `RideOffer` model
- Add `STALE_CANCEL` to RideEvent eventType docs (string field, no schema change)

**Lines changed:** ~5

### File: `src/lib/rides/state-machine.ts`

**Changes:**
- Add `RIDE_PENDING_COMPLETION` to `RideStatus` type
- Add transition rules for PENDING_COMPLETION (→ COMPLETED, → DISPUTED, → CANCELLED)
- Update IN_PROGRESS rules: remove COMPLETED (now goes through PENDING_COMPLETION)
- Add COMPLETED → DISPUTED rule (auto-close dispute grace, 24hr)
- Add `RIDE_PENDING_COMPLETION` to `CHAT_ALLOWED_STATES` and `ACTIVE_STATES`
- Update `getCancelPenalty` to include PENDING_COMPLETION (same as IN_PROGRESS: -15)

**Lines changed:** ~25

### File: `src/lib/rides/events.ts`

**Changes:**
- Add `OFFER_UPDATED` and `STALE_CANCEL` to `RideEventType`

**Lines changed:** 2

### File: `src/app/api/rides/[id]/status/route.ts`

**Changes:**
- `mark_done` action now transitions to `RIDE_PENDING_COMPLETION` (was no-op)
- `complete` action validates from `RIDE_PENDING_COMPLETION` (was IN_PROGRESS)
- Add `dispute` handling from RIDE_COMPLETED (auto-close grace window)
- Adjust reputation: `REQUESTER_CONFIRMED` = +25/+5, `AUTO_CLOSED` = +15/+0
- Return structured error codes instead of generic strings

**Lines changed:** ~40

### File: `src/app/api/rides/[id]/offers/route.ts`

**Changes:**
- Add `PATCH` handler for offer edits
- Validate: ride must be OPEN, caller must own offer
- Log `OFFER_UPDATED` event with before/after
- Notify requester only if price decreased

**Lines added:** ~50

### File: `src/app/api/rides/[id]/rate/route.ts`

**Changes:**
- Check `completionMode` to determine rating window (72hr vs 48hr)
- Apply rating weight (1.0x vs 0.7x vs 0.5x) when updating driverRatingAvg

**Lines changed:** ~15

### File: `src/app/api/cron/rides/route.ts`

**Changes:**
- Add CONFIRMED stale timeout (20 min)
- Add EN_ROUTE stale timeout (45 min, flagged suspicious)
- Add IN_PROGRESS stale timeout (3 hr → DISPUTED)
- Change auto-complete to watch PENDING_COMPLETION (was IN_PROGRESS)
- Update scheduled ride expiry to `scheduledAt + 15min`
- Reorder cron steps (7 steps instead of 4)

**Lines changed:** ~60

### File: `src/app/api/rides/route.ts`

**Changes:**
- Update scheduled expiry calculation: `scheduledAt + 15min`

**Lines changed:** 1

### File: `src/app/api/rides/[id]/poll/route.ts`

**Changes:**
- Include `autoCloseAt` derived field when status is PENDING_COMPLETION

**Lines changed:** ~5

### Files NOT changed:
- `distance.ts` — no changes
- `pricing.ts` — no changes
- `notify.ts` — add 2 new helper calls (stale timeout notifications), ~10 lines
- `[id]/route.ts` (detail) — no structural changes, status enum already dynamic
- `[id]/confirm/route.ts` — no changes
- `[id]/select/route.ts` — no changes (error codes are already 409)
- `[id]/messages/route.ts` — add PENDING_COMPLETION to allowed states, 1 line
- `mine/route.ts` — no changes

### Total estimated diff:
- **~200 lines changed/added** across 9 files
- **0 files deleted**
- **0 models removed**
- **1 enum value added**, **2 fields added to RideOffer**

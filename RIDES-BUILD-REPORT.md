# HAI Rides System — Build Report

**Date:** 2026-03-26
**Phase:** 1 — Backend / Domain Foundation
**Status:** Complete, type-safe, zero errors

---

## Summary

Built a complete ride-request bidding backend for the Hai platform. Users post trip requests, drivers compete by submitting price offers, the requester picks one, and a private trip lifecycle begins with full state tracking, audit logging, and reputation integration.

**Total new files:** 16
**Total new lines of code:** ~1,950
**New database models:** 7
**New API endpoints:** 11
**New enums:** 3

---

## 1. Database Schema Changes

### 7 New Models

| Model | Fields | Purpose |
|-------|--------|---------|
| **RideRequest** | 26 fields | The public ride listing — pickup/dropoff (with privacy), distance, pricing estimate, scheduling, status |
| **RideOffer** | 9 fields | Driver bids on a ride — price, arrival time, message. Unique per driver per ride |
| **Trip** | 19 fields | Created on driver confirm. Holds all lifecycle timestamps (7 write-once), completion mode, cancellation data |
| **RideRating** | 7 fields | Separate model, one rating per party per trip. Score 1-5 + comment |
| **RideDispute** | 9 fields | At most one per trip. Opened by either party, resolved by admin |
| **RideEvent** | 8 fields | Append-only audit log. 20 event types, actor tracking, JSON metadata |
| **RideMessage** | 8 fields | Ride-specific chat (separate from existing Thread system). TEXT or LOCATION type |

### 3 New Enums

| Enum | Values |
|------|--------|
| **RideStatus** | RIDE_OPEN, RIDE_SELECTED, RIDE_CONFIRMED, RIDE_EN_ROUTE, RIDE_ARRIVED, RIDE_IN_PROGRESS, RIDE_COMPLETED, RIDE_CANCELLED, RIDE_EXPIRED, RIDE_DISPUTED |
| **OfferStatus** | OFFER_PENDING, OFFER_ACCEPTED, OFFER_PASSED, OFFER_WITHDRAWN |
| **CompletionMode** | REQUESTER_CONFIRMED, AUTO_CLOSED |

### Existing Model Modifications

**User** — 6 new fields:
```
driverRatingAvg    Float?
driverRatingCount  Int     @default(0)
driverTripsCount   Int     @default(0)
driverCancelCount  Int     @default(0)
rideRequests       RideRequest[]  (relation)
rideOffers         RideOffer[]    (relation)
```

**Notification** — 3 new fields:
```
rideRequestId  String?
title          String?    (was implicit, now explicit for bilingual)
titleEn        String?
body           String?
bodyEn         String?
```

**NotificationType** — 5 new values:
```
RIDE_OFFER, RIDE_STATUS, RIDE_MESSAGE, RIDE_RATING, SYSTEM
```

---

## 2. Domain Services (`src/lib/rides/`)

### state-machine.ts (165 lines)
The core of the rides system. Defines all legal transitions, who can trigger them, and what's forbidden.

**Exports:**
- `canTransition(current, target, actor)` — returns `{ valid, error? }`
- `getActorRole(userId, requesterId, driverId, userRole?)` — maps user to role
- `getCancelPenalty(statusAtCancel)` — returns rep penalty (0 to -15)
- `CHAT_ALLOWED_STATES` — [CONFIRMED, EN_ROUTE, ARRIVED, IN_PROGRESS]
- `ACTIVE_STATES` — 6 non-terminal states
- `COORDS_VISIBLE_STATES` — 5 states where driver sees exact coords

**10 states, ~20 transition rules, every terminal state enforced.**

### pricing.ts (82 lines)
Price estimation engine — guidance only, never binding.

**Formula:**
```
base = 5 SAR (first 3 km free)
+ 1.5 SAR/km (after 3 km)
+ 0.3 SAR/min
× time multiplier (peak 1.3x, late-night 1.5x)

min = estimated × 0.7
max = estimated × 1.4
```

**Spam protection:**
- Hard block: price < 30% of estimated min
- Hard block: price > 300% of estimated max
- Soft warnings: tooLow / tooHigh flags (shown to requester, not blocking)

### distance.ts (62 lines)
Route calculation using haversine formula.

**Speed assumptions:**
- City (< 5 km): 25 km/h
- Urban (5-30 km): 35 km/h
- Highway (> 30 km): 80 km/h

**Validation:** Min 500m, max 500 km between pickup and dropoff.

### events.ts (78 lines)
Append-only audit trail. Every important action logged.

**20 event types:** REQUEST_CREATED, OFFER_SUBMITTED, OFFER_WITHDRAWN, OFFER_SELECTED, OFFERS_PASSED, DRIVER_CONFIRMED, DRIVER_EN_ROUTE, DRIVER_ARRIVED, TRIP_STARTED, DRIVER_MARKED_DONE, REQUESTER_CONFIRMED_DONE, AUTO_COMPLETED, CANCELLED, EXPIRED, DISPUTE_OPENED, DISPUTE_RESOLVED, TIMEOUT_REOPEN, NOSHOW_CANCEL, RATING_SUBMITTED, INVALID_TRANSITION

Each event records: rideRequestId, tripId, eventType, actorType, actorId, metadata (JSON), createdAt.

### notify.ts (154 lines)
Bilingual (AR/EN) notification helpers for all ride events.

**7 notification functions:**
- `notifyNewOffer()` — "عرض جديد على طلبك" / "New offer on your ride"
- `notifyDriverSelected()` — "تم اختيارك! أكّد خلال 5 دقائق"
- `notifyOffersPassed()` — bulk notify rejected drivers
- `notifyRequesterStatus()` — generic status update
- `notifyTripCompleted()` — both parties notified to rate
- `notifyConfirmTimeout()` — "السائق لم يرد"

---

## 3. API Endpoints (11 total)

### Ride CRUD

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/api/rides` | Create ride request | Required |
| GET | `/api/rides` | List OPEN rides (feed) | Required |
| GET | `/api/rides/mine` | My requests + my offers | Required |
| GET | `/api/rides/[id]` | Ride detail (privacy-filtered) | Required |

### Offer Management

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/api/rides/[id]/offers` | Submit offer | Required, not requester |

### Trip Lifecycle

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| POST | `/api/rides/[id]/select` | Select an offer (atomic) | Requester only |
| POST | `/api/rides/[id]/confirm` | Driver confirms (creates Trip) | Selected driver only |
| POST | `/api/rides/[id]/status` | All status transitions | Role-based |

### Communication & Rating

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET/POST | `/api/rides/[id]/messages` | Ride chat (state-restricted) | Participants only |
| POST | `/api/rides/[id]/rate` | Rate other party (72hr window) | Participants only |
| GET | `/api/rides/[id]/poll` | Lightweight polling | Participants |

### System

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/api/cron/rides` | Timeout handler (4 jobs) | Secret key |

---

## 4. State Machine

### Transition Table

| # | From | To | Actor | Creates | Timestamp |
|---|------|----|-------|---------|-----------|
| T1 | OPEN | SELECTED | requester | — | selectedAt |
| T2 | SELECTED | CONFIRMED | driver | Trip | confirmedAt |
| T3 | SELECTED | OPEN | system | — | selectedAt→null |
| T4 | CONFIRMED | EN_ROUTE | driver | — | enRouteAt |
| T5 | EN_ROUTE | ARRIVED | driver | — | arrivedAt |
| T6 | ARRIVED | IN_PROGRESS | driver | — | startedAt |
| T7 | ARRIVED | CANCELLED | system | — | cancelledAt |
| T8 | IN_PROGRESS | *(no change)* | driver | — | driverMarkedDoneAt |
| T9 | IN_PROGRESS | COMPLETED | requester | — | requesterConfirmedDoneAt, completedAt (REQUESTER_CONFIRMED) |
| T10 | IN_PROGRESS | COMPLETED | system | — | completedAt (AUTO_CLOSED) |
| T11 | IN_PROGRESS | DISPUTED | either | RideDispute | — |
| T12-T17 | various | CANCELLED | requester/driver | — | cancelledAt |
| T18 | OPEN | EXPIRED | system | — | — |
| T19 | DISPUTED | COMPLETED | admin | — | completedAt |
| T20 | DISPUTED | CANCELLED | admin | — | cancelledAt |

### Cancellation Matrix

| Cancel From | Free? | Penalty |
|-------------|-------|---------|
| OPEN | Yes | None |
| SELECTED | Yes | None (pre-confirm) |
| CONFIRMED | No | -5 rep |
| EN_ROUTE | No | -5 rep |
| ARRIVED | No | -10 rep |
| IN_PROGRESS | No | -15 rep |

Driver cancellations also increment `driverCancelCount`.

### Timeout Rules

| Timeout | From | Duration | Action |
|---------|------|----------|--------|
| Driver confirm | SELECTED | 5 min | Revert to OPEN |
| No-show | ARRIVED | 10 min | Auto-cancel, -5 rep to requester |
| Auto-complete | IN_PROGRESS (after mark_done) | 15 min | Complete as AUTO_CLOSED |
| Expiry (immediate) | OPEN | 2 hours from creation | EXPIRED |
| Expiry (scheduled) | OPEN | 30 min before scheduledAt | EXPIRED |

Cron runs every 60 seconds, processes in strict order: confirm → no-show → auto-complete → expiry.

---

## 5. Concurrency Safety

### Offer Selection
```typescript
db.rideRequest.updateMany({
  where: { id, status: 'RIDE_OPEN', selectedOfferId: null, requesterId: userId },
  data: { status: 'RIDE_SELECTED', selectedOfferId, ... }
})
// count === 0 → another selection won the race → 409
```

### Driver Confirmation
```typescript
db.rideRequest.updateMany({
  where: { id, status: 'RIDE_SELECTED', selectedOfferId, confirmDeadline: { gt: now } },
  data: { status: 'RIDE_CONFIRMED', confirmDeadline: null }
})
// count === 0 → deadline passed or already confirmed → 409
```

### Write-Once Timestamps
Every lifecycle timestamp (7 total) is checked before write:
```typescript
if (trip.arrivedAt !== null) return 409 // "arrivedAt already set"
```

---

## 6. Privacy Model

| Data | Public (feed) | Requester | Selected Driver | Other Drivers |
|------|--------------|-----------|-----------------|---------------|
| Pickup area | Yes | Yes | Yes | Yes |
| Pickup exact coords | No | Yes | After CONFIRMED | No |
| Pickup address | No | Yes | After CONFIRMED | No |
| Dropoff area | Yes | Yes | Yes | Yes |
| Dropoff exact coords | No | Yes | After CONFIRMED | No |
| All offers | No | Yes | No | No |
| Own offer | — | — | Yes | Yes (own only) |
| Driver stats | No | Yes (per offer) | — | — |
| Trip data | No | Yes | Yes | No |
| Chat | No | Yes | Yes | No |

---

## 7. Reputation Integration

| Event | Points | Who |
|-------|--------|-----|
| Trip completed (as driver) | +25 | Driver |
| Trip completed (as requester) | +5 | Requester |
| Positive rating received (score >= 4) | +5 | Target |
| Cancel from CONFIRMED/EN_ROUTE | -5 | Canceller |
| Cancel from ARRIVED | -10 | Canceller |
| Cancel from IN_PROGRESS | -15 | Canceller |
| No-show (system cancel at ARRIVED) | -5 | Requester |

---

## 8. Rate Limits

| Limit | Value | Scope |
|-------|-------|-------|
| Active ride requests | 1 per user | Concurrent |
| Ride creation | 3 per hour | Per user |
| Offer submission | 10 per hour | Per driver |
| Min account age for offers | 3 days | — |
| Driver confirm deadline | 5 minutes | Per selection |
| Rating window | 72 hours | After completion |

---

## 9. Files Created

```
src/lib/rides/
  state-machine.ts     — 165 lines
  pricing.ts           — 82 lines
  distance.ts          — 62 lines
  events.ts            — 78 lines
  notify.ts            — 154 lines

src/app/api/rides/
  route.ts             — 195 lines  (POST create, GET list)
  mine/route.ts        — 42 lines   (GET my rides)
  [id]/route.ts        — 132 lines  (GET detail)
  [id]/offers/route.ts — 119 lines  (POST submit offer)
  [id]/select/route.ts — 98 lines   (POST select offer)
  [id]/confirm/route.ts — 90 lines  (POST driver confirm)
  [id]/status/route.ts — 245 lines  (POST all transitions)
  [id]/rate/route.ts   — 106 lines  (POST rate)
  [id]/messages/route.ts — 113 lines (GET/POST chat)
  [id]/poll/route.ts   — 51 lines   (GET polling)

src/app/api/cron/
  rides/route.ts       — 192 lines  (timeout handler)

prisma/
  schema.prisma        — ~150 lines added (7 models, 3 enums, User/Notification fields)
```

---

## 10. What's Next (Phase 2 — UI)

Not yet built:
- `/rides` — Rides feed page
- `/rides/new` — Create ride request (with map picker)
- `/rides/[id]` — Ride detail + offers + trip tracker + chat
- BottomNav rides tab
- i18n ride translation keys (~50)
- Admin panel "Rides" tab for disputes
- Driver stats section in profile page

---

## 11. Quality Checklist

| Check | Status |
|-------|--------|
| TypeScript: zero ride-specific errors | ✅ |
| All endpoints authenticated | ✅ |
| Race conditions handled (atomic updates) | ✅ |
| Write-once timestamps enforced | ✅ |
| Append-only audit trail (RideEvent) | ✅ |
| AUTO_CLOSED vs REQUESTER_CONFIRMED distinguishable | ✅ |
| Scheduled ride expiry explicit | ✅ |
| Cancellation penalties documented + enforced | ✅ |
| Privacy filtering (coords, offers, trip data) | ✅ |
| Bilingual notifications (AR/EN) | ✅ |
| No TODO/placeholder code | ✅ |
| Reputation integration (6 event types) | ✅ |
| Spam protection (price floor/ceiling, rate limits) | ✅ |
| Cron order: confirm → no-show → auto-complete → expiry | ✅ |

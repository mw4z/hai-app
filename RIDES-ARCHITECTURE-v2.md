# HAI Rides — Phase 1: Domain Architecture v2

---

## 1. Database Schema

### 1.1 Enums

```prisma
enum RideStatus {
  OPEN
  SELECTED
  CONFIRMED
  EN_ROUTE
  ARRIVED
  IN_PROGRESS
  COMPLETED
  CANCELLED
  EXPIRED
  DISPUTED
}

enum OfferStatus {
  PENDING
  ACCEPTED
  PASSED
  WITHDRAWN
}

enum RideEventType {
  REQUEST_CREATED
  OFFER_SUBMITTED
  OFFER_WITHDRAWN
  OFFER_SELECTED
  OFFERS_PASSED
  DRIVER_CONFIRMED
  DRIVER_EN_ROUTE
  DRIVER_ARRIVED
  TRIP_STARTED
  DRIVER_MARKED_DONE
  REQUESTER_CONFIRMED_DONE
  AUTO_COMPLETED
  CANCELLED
  EXPIRED
  DISPUTE_OPENED
  DISPUTE_RESOLVED
  TIMEOUT_REOPEN
  NOSHOW_CANCEL
  RATING_SUBMITTED
}

enum CompletionMode {
  REQUESTER_CONFIRMED
  AUTO_CLOSED
}
```

### 1.2 RideRequest

```prisma
model RideRequest {
  id                 String      @id @default(cuid())

  requesterId        String
  requester          User        @relation("rideRequests", fields: [requesterId], references: [id])

  // Pickup — exact coords private, area public
  pickupLat          Float
  pickupLng          Float
  pickupAddress      String      // exact — revealed only to confirmed driver
  pickupArea         String      // district name — always public

  // Dropoff — same privacy model
  dropoffLat         Float
  dropoffLng         Float
  dropoffAddress     String
  dropoffArea        String

  // System-calculated at creation (immutable)
  distanceKm         Float
  durationMin        Int
  estimatedMinPrice  Int         // guidance only
  estimatedMaxPrice  Int         // guidance only

  // Scheduling
  isImmediate        Boolean     @default(true)
  scheduledAt        DateTime?   // null = immediate

  notes              String?     // max 200 chars

  // State
  status             RideStatus  @default(OPEN)
  selectedOfferId    String?     @unique

  // Deadlines
  confirmDeadline    DateTime?   // driver must confirm by this time (set on SELECTED)
  expiresAt          DateTime    // request auto-expires

  // Timestamps
  selectedAt         DateTime?   // T1: requester selects offer
  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt

  neighborhoodId     String?

  // Relations
  offers             RideOffer[]
  trip               Trip?
  events             RideEvent[]

  @@index([status, neighborhoodId, createdAt])
  @@index([requesterId, status])
  @@index([expiresAt])
}
```

### 1.3 RideOffer

```prisma
model RideOffer {
  id              String       @id @default(cuid())

  rideRequestId   String
  rideRequest     RideRequest  @relation(fields: [rideRequestId], references: [id])

  driverId        String
  driver          User         @relation("rideOffers", fields: [driverId], references: [id])

  price           Int          // SAR
  arrivalMin      Int          // "I can be there in X minutes"
  message         String?      // max 100 chars

  status          OfferStatus  @default(PENDING)
  createdAt       DateTime     @default(now())

  @@unique([rideRequestId, driverId])
  @@index([rideRequestId, status])
  @@index([driverId])
}
```

### 1.4 Trip

Created on CONFIRMED (not EN_ROUTE). Every lifecycle timestamp is a separate nullable field, set exactly once.

```prisma
model Trip {
  id                       String          @id @default(cuid())

  rideRequestId            String          @unique
  rideRequest              RideRequest     @relation(fields: [rideRequestId], references: [id])

  requesterId              String
  driverId                 String
  agreedPrice              Int             // snapshot from accepted offer

  // Lifecycle timestamps — each set once, never overwritten
  confirmedAt              DateTime        @default(now())  // driver confirmed
  enRouteAt                DateTime?       // driver started driving to pickup
  arrivedAt                DateTime?       // driver at pickup
  startedAt                DateTime?       // trip started (requester boarded)
  driverMarkedDoneAt       DateTime?       // driver signals arrival at destination
  requesterConfirmedDoneAt DateTime?       // requester confirms completion
  completedAt              DateTime?       // final completion timestamp
  cancelledAt              DateTime?

  // Completion semantics
  completionMode           CompletionMode? // REQUESTER_CONFIRMED | AUTO_CLOSED

  // Cancellation
  cancelledBy              String?         // userId
  cancelReason             String?         // max 200 chars

  createdAt                DateTime        @default(now())
  updatedAt                DateTime        @updatedAt

  // Relations
  ratings                  RideRating[]
  dispute                  RideDispute?

  @@index([requesterId])
  @@index([driverId])
}
```

### 1.5 RideRating

Separate model. Each trip produces 0-2 ratings (requester rates driver, driver rates requester).

```prisma
model RideRating {
  id          String   @id @default(cuid())

  tripId      String
  trip        Trip     @relation(fields: [tripId], references: [id])

  raterId     String   // who gave the rating
  targetId    String   // who received the rating
  role        String   // "requester_rates_driver" | "driver_rates_requester"

  score       Int      // 1-5
  comment     String?  // max 200 chars

  createdAt   DateTime @default(now())

  @@unique([tripId, raterId])  // one rating per person per trip
  @@index([targetId])
}
```

### 1.6 RideDispute

Separate model. At most one dispute per trip.

```prisma
model RideDispute {
  id             String    @id @default(cuid())

  tripId         String    @unique
  trip           Trip      @relation(fields: [tripId], references: [id])

  openedBy       String    // userId
  reason         String    // max 500 chars
  status         String    @default("open") // "open" | "resolved_completed" | "resolved_cancelled"

  // Resolution
  resolvedBy     String?   // admin userId
  resolution     String?   // admin notes, max 500 chars
  resolvedAt     DateTime?

  createdAt      DateTime  @default(now())

  @@index([status])
}
```

### 1.7 RideEvent (Audit Log)

Every meaningful state change, user action, or system action is recorded. Immutable append-only table.

```prisma
model RideEvent {
  id              String        @id @default(cuid())

  rideRequestId   String
  rideRequest     RideRequest   @relation(fields: [rideRequestId], references: [id])

  tripId          String?       // null for pre-trip events (OPEN, offers, selection)

  eventType       RideEventType
  actorType       String        // "requester" | "driver" | "system" | "admin"
  actorId         String?       // userId, null for system

  metadata        Json?         // event-specific payload (see below)
  createdAt       DateTime      @default(now())

  @@index([rideRequestId, createdAt])
  @@index([tripId, createdAt])
}
```

**Metadata examples by event type:**

| EventType | Metadata |
|-----------|----------|
| `OFFER_SUBMITTED` | `{ offerId, price, arrivalMin }` |
| `OFFER_SELECTED` | `{ offerId, driverId, confirmDeadline }` |
| `DRIVER_CONFIRMED` | `{ tripId, agreedPrice }` |
| `DRIVER_MARKED_DONE` | `{ autoCompleteAt }` |
| `AUTO_COMPLETED` | `{ driverMarkedDoneAt, elapsed: "15min" }` |
| `CANCELLED` | `{ cancelledBy, reason, fromStatus, penaltyApplied }` |
| `TIMEOUT_REOPEN` | `{ previousOfferId, elapsedMin: 5 }` |
| `NOSHOW_CANCEL` | `{ arrivedAt, elapsedMin: 10 }` |
| `DISPUTE_RESOLVED` | `{ resolution, resolvedBy }` |
| `RATING_SUBMITTED` | `{ ratingId, score, role }` |

### 1.8 User Model Additions

```prisma
// Add to existing User model:
  rideRequests       RideRequest[] @relation("rideRequests")
  rideOffers         RideOffer[]   @relation("rideOffers")
  driverRatingAvg    Float?        // cached, recalculated on each new rating
  driverRatingCount  Int           @default(0)
  driverTripsCount   Int           @default(0)
  driverCancelCount  Int           @default(0)
```

---

## 2. State Machine

### 2.1 States

| State | Meaning | Who's waiting |
|-------|---------|--------------|
| OPEN | Accepting offers | Requester waits for offers |
| SELECTED | Offer chosen, driver must confirm | Driver has 5 min |
| CONFIRMED | Driver accepted the job | Driver prepares to depart |
| EN_ROUTE | Driver driving to pickup | Requester waits |
| ARRIVED | Driver at pickup location | Requester must board (10 min) |
| IN_PROGRESS | Trip active, driving to destination | Both in car |
| COMPLETED | Trip finished | Ratings window open |
| CANCELLED | Terminated by user or system | Terminal |
| EXPIRED | No selection before deadline | Terminal |
| DISPUTED | Under admin review | Admin must resolve |

**Why CONFIRMED and EN_ROUTE are separate:**
- CONFIRMED = driver accepted but hasn't left yet (may need a few minutes to get to their car)
- EN_ROUTE = driver is actively driving toward pickup
- Separate timestamps: `confirmedAt` vs `enRouteAt`
- Product value: requester knows the difference between "accepted" and "on the way"

### 2.2 Transition Table

| # | From | To | Triggered By | Preconditions | Timestamp Set |
|---|------|----|-------------|---------------|---------------|
| T1 | OPEN | SELECTED | Requester | ≥1 PENDING offer exists | `selectedAt` |
| T2 | SELECTED | CONFIRMED | Driver | Caller is selected driver; within `confirmDeadline` | `trip.confirmedAt` |
| T3 | SELECTED | OPEN | System | `confirmDeadline` passed | `selectedAt` nulled |
| T4 | CONFIRMED | EN_ROUTE | Driver | Caller is `trip.driverId` | `trip.enRouteAt` |
| T5 | EN_ROUTE | ARRIVED | Driver | Caller is `trip.driverId` | `trip.arrivedAt` |
| T6 | ARRIVED | IN_PROGRESS | Driver | Caller is `trip.driverId` | `trip.startedAt` |
| T7 | ARRIVED | CANCELLED | System | 10 min since `arrivedAt` | `trip.cancelledAt` |
| T8 | IN_PROGRESS | IN_PROGRESS | Driver | Driver signals done (no state change) | `trip.driverMarkedDoneAt` |
| T9 | IN_PROGRESS | COMPLETED | Requester | `driverMarkedDoneAt` is set OR requester initiates | `trip.requesterConfirmedDoneAt`, `trip.completedAt`, mode=REQUESTER_CONFIRMED |
| T10 | IN_PROGRESS | COMPLETED | System | 15 min since `driverMarkedDoneAt` | `trip.completedAt`, mode=AUTO_CLOSED |
| T11 | IN_PROGRESS | DISPUTED | Either | Caller is requester or driver | — |
| T12 | OPEN | CANCELLED | Requester | Caller owns request | — |
| T13 | SELECTED | CANCELLED | Requester | Free cancel (pre-confirm) | — |
| T14 | CONFIRMED | CANCELLED | Either | Logged + penalty | `trip.cancelledAt` |
| T15 | EN_ROUTE | CANCELLED | Either | Logged + penalty | `trip.cancelledAt` |
| T16 | ARRIVED | CANCELLED | Either | Logged + penalty | `trip.cancelledAt` |
| T17 | IN_PROGRESS | CANCELLED | Either | Logged + heavier penalty | `trip.cancelledAt` |
| T18 | OPEN | EXPIRED | System | `expiresAt` reached | — |
| T19 | DISPUTED | COMPLETED | Admin | Resolve as completed | `trip.completedAt`, mode=REQUESTER_CONFIRMED |
| T20 | DISPUTED | CANCELLED | Admin | Resolve as cancelled | `trip.cancelledAt` |

### 2.3 Completion Semantics

`COMPLETED` is one state, but `completionMode` distinguishes:

| Mode | Meaning | Trigger |
|------|---------|---------|
| `REQUESTER_CONFIRMED` | Requester explicitly confirmed trip is done | T9 or T19 |
| `AUTO_CLOSED` | System closed after 15 min timeout | T10 |

Both are final, but `AUTO_CLOSED` can be flagged for admin review if the requester later complains. The event log records which path was taken.

### 2.4 Invalid Transition Handling

```typescript
function validateTransition(
  currentStatus: RideStatus,
  targetStatus: RideStatus,
  callerRole: 'requester' | 'driver' | 'system' | 'admin'
): { valid: boolean; error?: string }
```

- Returns `{ valid: false, error: "..." }` with specific message
- API returns `409 Conflict` with `{ error, currentStatus, attemptedStatus }`
- Every rejected transition is logged as a `RideEvent` with type `INVALID_TRANSITION` (metadata includes attempted target)

---

## 3. Timeout Rules

| Rule | Watched State | Deadline Calculation | Action | Notification | Penalty |
|------|--------------|---------------------|--------|-------------|---------|
| Driver confirm | SELECTED | `confirmDeadline` = `selectedAt + 5 min` | Revert to OPEN; selected offer → PASSED; `selectedAt`/`selectedOfferId` nulled; offers remain for reselection | Requester: "السائق لم يرد" / Driver: "انتهت مهلة التأكيد" | Driver: +1 no-confirm count (affects sort rank) |
| Requester no-show | ARRIVED | `arrivedAt + 10 min` | Status → CANCELLED | Both notified | Requester: -5 rep |
| Auto-complete | IN_PROGRESS (with `driverMarkedDoneAt` set) | `driverMarkedDoneAt + 15 min` | Status → COMPLETED; completionMode = AUTO_CLOSED | Requester: "تم إغلاق الرحلة تلقائياً" | None |
| Request expiry (immediate) | OPEN | `createdAt + 2 hours` | Status → EXPIRED | Requester: "انتهت صلاحية طلبك" | None |
| Request expiry (scheduled) | OPEN | `scheduledAt - 30 min` | Status → EXPIRED | Requester: "انتهت صلاحية طلبك" | None |
| Scheduled visibility | — | `scheduledAt - 2 hours` | Request becomes visible in feed | — | — |
| Rating window | COMPLETED | `completedAt + 72 hours` | Rating endpoint returns 410 Gone | — | — |

**Cron implementation:**

Single endpoint `GET /api/cron/rides` called every 60 seconds. Executes 4 queries in sequence:

```
1. SELECT ... WHERE status = 'SELECTED' AND confirmDeadline < NOW()
   → revert each to OPEN, log TIMEOUT_REOPEN event

2. SELECT ... WHERE status = 'OPEN' AND expiresAt < NOW()
   → set EXPIRED, log EXPIRED event

3. SELECT trips WHERE ride.status = 'ARRIVED' AND arrivedAt + 10min < NOW()
   → cancel, log NOSHOW_CANCEL event

4. SELECT trips WHERE ride.status = 'IN_PROGRESS'
     AND driverMarkedDoneAt IS NOT NULL
     AND driverMarkedDoneAt + 15min < NOW()
   → complete with AUTO_CLOSED, log AUTO_COMPLETED event
```

---

## 4. Integration Touchpoints

### 4.1 Auth (`src/lib/auth.ts`)

**Touchpoints:**
- Every ride API calls `getSession()` — no changes to auth itself
- New permission checks needed inside ride APIs:
  - "Is caller the requester of this ride?"
  - "Is caller the selected driver of this ride?"
  - "Is caller an admin?" (for dispute resolution)

**Action:** No changes to `auth.ts`. Permission logic lives in each ride API route.

### 4.2 Notifications (`src/lib/notifications.ts`)

**Touchpoints:**
- `createNotification()` called from ride APIs for all 15 event types
- Current function signature: `createNotification({ userId, type, title, titleEn, body, bodyEn, actorId?, postId?, threadId? })`

**Action required:** Add optional `rideRequestId` field to Notification model:
```prisma
// Add to Notification model:
  rideRequestId  String?
```
This lets notification tap navigate to `/rides/{id}` instead of `/feed`.

Also add notification type values: `RIDE_OFFER`, `RIDE_STATUS`, `RIDE_MESSAGE`, `RIDE_RATING`.

### 4.3 Reputation (`src/lib/reputation.ts`)

**Touchpoints:**
- Trip completion: `addReputation(driverId, 'ride_completed', +25, { fromUserId: requesterId })`
- Trip completion: `addReputation(requesterId, 'ride_requested', +5, { fromUserId: driverId })`
- Cancel penalties: `addReputation(cancellerId, 'ride_cancel', -5/-10/-15, {})`
- No-show: `addReputation(requesterId, 'ride_noshow', -5, {})`
- Rating submitted: `addReputation(targetId, 'ride_rated', +5, { fromUserId: raterId })` (if score >= 4)

**Action required:** Add new action types to `REP_POINTS` in `reputation.ts`:
```typescript
ride_completed: 25,
ride_requested: 5,
ride_cancel: -10,    // variable, passed as override
ride_noshow: -5,
ride_rated: 5,
```

Existing anti-gaming (pair limit, daily cap) applies as-is. No refactoring.

### 4.4 Chat / Messages

**Decision:** Rides do NOT reuse the existing Thread/Message system.

**Reason:** Thread model is tied to `user1Id`/`user2Id`/`postId` with status logic (OPEN/CLOSED/coordination modes) that doesn't map to ride lifecycle. Ride chat has different authorization rules (only active during specific states) and different lifecycle (auto-created, auto-closed).

**Action:** Ride chat uses its own `RideMessage` model:
```prisma
model RideMessage {
  id              String   @id @default(cuid())
  rideRequestId   String
  senderId        String
  body            String   // max 500 chars
  type            String   @default("TEXT") // TEXT | LOCATION
  lat             Float?
  lng             Float?
  createdAt       DateTime @default(now())

  @@index([rideRequestId, createdAt])
}
```

**Authorization:** Messages only allowed when ride status is in `[CONFIRMED, EN_ROUTE, ARRIVED, IN_PROGRESS]`. Read-only access for 1 hour after COMPLETED.

### 4.5 Admin Panel (`src/app/admin/AdminClient.tsx`)

**Touchpoints:**
- New tab: "التوصيلات" / "Rides"
- Sub-sections: Active rides, Disputes, Cancelled (high-frequency)

**Action required:**
- Add `rides` tab to admin `Tab` type union
- New API: `GET /api/admin/lists?list=ride_disputes` — returns open disputes with trip details
- New admin actions in `/api/admin/action`:
  - `resolve_ride_dispute` — sets dispute status + ride status
  - `cancel_ride_admin` — force-cancel any active ride
- Rides disputes use existing `ModerationLog` for audit

### 4.6 i18n (`src/lib/i18n.ts`)

**Action:** Add ~50 translation keys. Grouped:

```
ride_*           — ride feed, creation, status labels
ride_offer_*     — offer submission, comparison
ride_trip_*      — trip tracker states
ride_rate_*      — rating screen
ride_notify_*    — notification messages
ride_error_*     — validation errors
```

### 4.7 User Profile (`src/app/profile/ProfileClient.tsx`)

**Touchpoints:**
- Show driver stats section if user has any completed trips as driver:
  - "⭐ 4.8 (23 رحلة)" / "⭐ 4.8 (23 trips)"
  - Cancel rate
- Show "رحلاتي" / "My Rides" link

**Action:** Add conditional section in ProfileClient that reads `user.driverTripsCount` and `user.driverRatingAvg`.

### 4.8 Bottom Navigation (`src/components/BottomNav.tsx`)

**Current tabs:** الرئيسية | المحادثات | السوق | خدمات | حسابي

**Decision:** Replace السوق (market, currently placeholder) with 🚗 التوصيلات (Rides).

**Action:** Change one entry in BottomNav:
```typescript
{ key: 'rides', href: '/rides', icon: FiNavigation, label: 'nav_rides' }
```

### 4.9 Prisma Schema (`prisma/schema.prisma`)

**Total additions:**
- 6 new models: `RideRequest`, `RideOffer`, `Trip`, `RideRating`, `RideDispute`, `RideEvent`, `RideMessage`
- 3 new enums: `RideStatus`, `OfferStatus`, `RideEventType`, `CompletionMode`
- 4 new fields on User model
- 1 new field on Notification model (`rideRequestId`)

### 4.10 Cron System

**Current state:** No cron exists in the project.

**Action:** Create `/api/cron/rides/route.ts` with a secret-key-guarded GET endpoint. Options for triggering:
- Vercel Cron (if deployed to Vercel)
- External cron service hitting the endpoint every 60s
- Dev: manual trigger via `curl localhost:3001/api/cron/rides?key=SECRET`

---

## 5. File Manifest (What Will Be Created)

```
src/lib/rides/
  state-machine.ts        — transition validator + rules
  pricing.ts              — estimatePrice(km, min, hour)
  distance.ts             — haversine + duration estimate

src/app/api/rides/
  route.ts                — POST create, GET list
  mine/route.ts           — GET my requests + offers
  [id]/route.ts           — GET detail (privacy-filtered)
  [id]/offers/route.ts    — POST submit, GET list
  [id]/select/route.ts    — POST select offer
  [id]/confirm/route.ts   — POST driver confirm
  [id]/status/route.ts    — POST status transitions
  [id]/rate/route.ts      — POST rate
  [id]/messages/route.ts  — GET/POST chat
  [id]/poll/route.ts      — GET lightweight polling

src/app/api/cron/
  rides/route.ts          — timeout handler

prisma/
  schema.prisma           — updated with new models
```

UI files (Phase 2, not yet):
```
src/app/rides/
  page.tsx                — rides feed
  new/page.tsx            — create request
  [id]/page.tsx           — detail + offers + tracker
```

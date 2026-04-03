# HAI Rides — Phase 1: Domain Architecture

## 1. Database Schema

### 1.1 Enums

```prisma
enum RideStatus {
  OPEN           // Accepting offers
  SELECTED       // Offer chosen, awaiting driver confirm (5 min timeout)
  EN_ROUTE       // Driver confirmed + heading to pickup
  ARRIVED        // Driver at pickup (10 min no-show timeout)
  IN_PROGRESS    // Trip active
  COMPLETED      // Trip finished + confirmed
  CANCELLED      // Cancelled by either party
  EXPIRED        // No selection before deadline
  DISPUTED       // Under admin review
}

enum OfferStatus {
  PENDING        // Awaiting selection
  ACCEPTED       // This offer was chosen
  PASSED         // Another offer was chosen (frozen, not deleted)
  WITHDRAWN      // Driver pulled their offer before selection
}
```

### 1.2 RideRequest

```prisma
model RideRequest {
  id                 String      @id @default(cuid())

  // Owner
  requesterId        String
  requester          User        @relation("rideRequests", fields: [requesterId], references: [id])

  // Pickup — exact coords private, area public
  pickupLat          Float
  pickupLng          Float
  pickupAddress      String      // "شارع الحج، حي الزايدي" — shown only to selected driver
  pickupArea         String      // "حي الزايدي" — shown publicly

  // Dropoff — same privacy model
  dropoffLat         Float
  dropoffLng         Float
  dropoffAddress     String
  dropoffArea        String

  // System-calculated (read-only after creation)
  distanceKm         Float       // e.g. 12.3
  durationMin        Int         // e.g. 18
  estimatedMinPrice  Int         // guidance only, e.g. 15
  estimatedMaxPrice  Int         // guidance only, e.g. 25

  // Scheduling
  isImmediate        Boolean     @default(true)
  scheduledAt        DateTime?   // null = now

  // Optional
  notes              String?     // max 200 chars

  // State
  status             RideStatus  @default(OPEN)
  selectedOfferId    String?     @unique
  confirmDeadline    DateTime?   // set when SELECTED, cleared when EN_ROUTE

  // Lifecycle
  expiresAt          DateTime    // OPEN requests auto-expire
  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt

  // Scope
  neighborhoodId     String?

  // Relations
  offers             RideOffer[]
  trip               Trip?

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

  price           Int          // SAR, driver's bid
  arrivalMin      Int          // "I'll be there in X minutes"
  message         String?      // max 100 chars, e.g. "كامري 2024"

  status          OfferStatus  @default(PENDING)
  createdAt       DateTime     @default(now())

  @@unique([rideRequestId, driverId]) // one offer per driver per request
  @@index([rideRequestId, status])
  @@index([driverId])
}
```

### 1.4 Trip

Created when driver confirms (transitions SELECTED → EN_ROUTE). Holds all post-selection lifecycle data.

```prisma
model Trip {
  id              String    @id @default(cuid())

  rideRequestId   String    @unique
  rideRequest     RideRequest @relation(fields: [rideRequestId], references: [id])

  requesterId     String
  driverId        String
  agreedPrice     Int       // copied from accepted offer at creation time

  // Timestamps — each set exactly once when that transition fires
  enRouteAt       DateTime  @default(now())  // = trip creation time
  arrivedAt       DateTime?
  startedAt       DateTime?
  completedAt     DateTime?
  cancelledAt     DateTime?

  // Cancellation
  cancelledBy     String?   // userId
  cancelReason    String?   // max 200 chars

  // Dispute
  disputedBy      String?   // userId who opened dispute
  disputeReason   String?   // max 500 chars
  disputeStatus   String?   // "open" | "resolved_for_requester" | "resolved_for_driver"
  resolvedBy      String?   // admin userId
  resolvedAt      DateTime?

  // Ratings — set independently by each party after COMPLETED
  requesterRating   Int?    // 1-5, given BY requester about driver
  requesterComment  String? // max 200 chars
  driverRating      Int?    // 1-5, given BY driver about requester
  driverComment     String? // max 200 chars

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([requesterId])
  @@index([driverId])
}
```

### 1.5 User Model Additions

```prisma
// Add to existing User model:
  rideRequests      RideRequest[]  @relation("rideRequests")
  rideOffers        RideOffer[]    @relation("rideOffers")
  driverRatingAvg   Float?         // cached average (recalculated on each new rating)
  driverRatingCount Int            @default(0)
  driverTripsCount  Int            @default(0)   // completed trips as driver
  driverCancelCount Int            @default(0)   // cancellations as driver
```

### 1.6 Why No Separate Rating or Dispute Model

- **Ratings**: Each trip has exactly 2 ratings (requester→driver, driver→requester). Fixed cardinality = fields on Trip, not a join table.
- **Disputes**: Each trip has at most 1 dispute. Fixed cardinality = fields on Trip.
- Separate models only justified if ratings/disputes could be many-to-many or need independent querying at scale. Not the case here.

---

## 2. State Machine

### 2.1 Transitions

| # | From | To | Triggered By | Condition |
|---|------|----|-------------|-----------|
| T1 | OPEN | SELECTED | Requester | Must have ≥1 PENDING offer; requester owns request |
| T2 | SELECTED | EN_ROUTE | Driver | Driver is the selected offer's driver; within confirmDeadline |
| T3 | SELECTED | OPEN | System | confirmDeadline passed (5 min timeout); auto-reopen |
| T4 | EN_ROUTE | ARRIVED | Driver | Driver is trip.driverId |
| T5 | ARRIVED | IN_PROGRESS | Driver | Driver is trip.driverId |
| T6 | ARRIVED | CANCELLED | System | 10 min no-show timeout; requester didn't board |
| T7 | IN_PROGRESS | COMPLETED | Requester | Requester confirms arrival at destination |
| T8 | IN_PROGRESS | COMPLETED | System | 15 min after driver triggers completion request |
| T9 | OPEN | CANCELLED | Requester | Requester owns request |
| T10 | SELECTED | CANCELLED | Requester | Free cancel (driver hasn't confirmed yet) |
| T11 | EN_ROUTE+ | CANCELLED | Either | Post-confirm cancel; logged + penalty applied |
| T12 | OPEN | EXPIRED | System | expiresAt reached |
| T13 | IN_PROGRESS | DISPUTED | Either | Only from IN_PROGRESS or driver-claimed completion |
| T14 | DISPUTED | COMPLETED | Admin | Resolve in favor of completion |
| T15 | DISPUTED | CANCELLED | Admin | Resolve in favor of cancellation |

### 2.2 Transition Rules

```typescript
const TRANSITIONS: Record<RideStatus, { to: RideStatus; by: 'requester' | 'driver' | 'system' | 'admin' | 'either' }[]> = {
  OPEN:        [
    { to: 'SELECTED',  by: 'requester' },
    { to: 'CANCELLED', by: 'requester' },
    { to: 'EXPIRED',   by: 'system'    },
  ],
  SELECTED:    [
    { to: 'EN_ROUTE',  by: 'driver'    },
    { to: 'OPEN',      by: 'system'    },  // timeout reopen
    { to: 'CANCELLED', by: 'requester' },
  ],
  EN_ROUTE:    [
    { to: 'ARRIVED',   by: 'driver'    },
    { to: 'CANCELLED', by: 'either'    },
  ],
  ARRIVED:     [
    { to: 'IN_PROGRESS', by: 'driver'  },
    { to: 'CANCELLED',   by: 'either'  },
    { to: 'CANCELLED',   by: 'system'  },  // no-show timeout
  ],
  IN_PROGRESS: [
    { to: 'COMPLETED', by: 'requester' },
    { to: 'COMPLETED', by: 'system'    },  // auto after 15 min
    { to: 'DISPUTED',  by: 'either'    },
  ],
  COMPLETED:   [],  // terminal
  CANCELLED:   [],  // terminal
  EXPIRED:     [],  // terminal
  DISPUTED:    [
    { to: 'COMPLETED', by: 'admin'     },
    { to: 'CANCELLED', by: 'admin'     },
  ],
}
```

### 2.3 Invalid Transition Handling

Every status-change API call validates:
1. Current status allows the target status (lookup in TRANSITIONS)
2. The caller has the correct role (requester/driver/system/admin)
3. Return `409 Conflict` with `{ error: "Invalid transition", current: "...", attempted: "..." }`

No silent failures. No skipping states.

### 2.4 Timeout Behaviors

| Timeout | From State | Duration | Action |
|---------|-----------|----------|--------|
| Driver confirm | SELECTED | 5 min | Revert to OPEN; mark offer as PASSED; notify requester |
| Requester no-show | ARRIVED | 10 min | Cancel trip; no penalty to driver; -5 rep to requester |
| Completion confirm | IN_PROGRESS (after driver signals done) | 15 min | Auto-complete |
| Request expiry | OPEN | 2 hours (immediate) or scheduledAt - 30min | Status → EXPIRED |

**Implementation**: Cron job runs every 60 seconds, queries for overdue deadlines:
```sql
-- Confirm timeout
UPDATE ride_requests SET status = 'OPEN', selectedOfferId = NULL
WHERE status = 'SELECTED' AND confirmDeadline < NOW();

-- Expiry
UPDATE ride_requests SET status = 'EXPIRED'
WHERE status = 'OPEN' AND expiresAt < NOW();
```

For ARRIVED no-show and completion auto-confirm: same cron checks `trip.arrivedAt + 10min` and driver's completion signal timestamp.

---

## 3. API Contract

### 3.1 Create Ride Request

```
POST /api/rides
Auth: required
Permission: any authenticated user

Request:
{
  pickupLat: number,       // required, -90..90
  pickupLng: number,       // required, -180..180
  pickupAddress: string,   // required, 5-200 chars
  pickupArea: string,      // required, 2-50 chars (district name)
  dropoffLat: number,      // required
  dropoffLng: number,      // required
  dropoffAddress: string,  // required, 5-200 chars
  dropoffArea: string,     // required, 2-50 chars
  isImmediate: boolean,    // required
  scheduledAt?: string,    // ISO datetime, required if !isImmediate, must be 30min-48hr in future
  notes?: string           // optional, max 200 chars
}

Response 201:
{
  id: string,
  distanceKm: number,        // server-calculated
  durationMin: number,       // server-calculated
  estimatedMinPrice: number, // server-calculated guidance
  estimatedMaxPrice: number, // server-calculated guidance
  status: "OPEN",
  expiresAt: string
}

Validation:
- User must not have another OPEN/SELECTED/EN_ROUTE/ARRIVED/IN_PROGRESS request
- Pickup ≠ dropoff (min 500m apart)
- Distance must be 0.5-500 km
- Rate limit: 3 requests per hour
```

### 3.2 List Rides

```
GET /api/rides?status=OPEN&neighborhood={id}&cursor={datetime}
Auth: required

Response 200:
{
  rides: [{
    id: string,
    pickupArea: string,          // district only, never exact
    dropoffArea: string,         // district only
    distanceKm: number,
    durationMin: number,
    estimatedMinPrice: number,
    estimatedMaxPrice: number,
    isImmediate: boolean,
    scheduledAt: string | null,
    notes: string | null,
    status: "OPEN",
    offerCount: number,
    createdAt: string,
    requester: {
      id: string,
      name: string,
      avatarUrl: string | null,
      requesterRating: number | null  // their rating AS requester
    }
  }],
  nextCursor: string | null
}

Note: exact coordinates NEVER returned in list endpoint.
```

### 3.3 Get Ride Detail

```
GET /api/rides/{id}
Auth: required

Response 200:
{
  ...rideFields,
  // Exact coords ONLY if caller is requester OR selected driver
  pickupLat?: number,
  pickupLng?: number,
  pickupAddress?: string,
  dropoffLat?: number,
  dropoffLng?: number,
  dropoffAddress?: string,
  // Offers: only visible to requester
  offers?: [{
    id: string,
    price: number,
    arrivalMin: number,
    message: string | null,
    status: "PENDING" | "ACCEPTED" | "PASSED",
    createdAt: string,
    driver: {
      id: string,
      name: string,
      avatarUrl: string | null,
      driverRatingAvg: number | null,
      driverTripsCount: number,
      cancelRate: number            // driverCancelCount / driverTripsCount
    }
  }],
  // Trip: only if status >= EN_ROUTE
  trip?: {
    id: string,
    agreedPrice: number,
    enRouteAt: string,
    arrivedAt: string | null,
    startedAt: string | null,
    completedAt: string | null,
    driverName: string,
    driverAvatarUrl: string | null,
    driverPhone: string             // only for requester, only after EN_ROUTE
  }
}

Privacy rules:
- Anonymous viewer: pickupArea/dropoffArea only
- Requester: sees everything + all offers
- Selected driver: sees exact coords + own offer only
- Other drivers: sees pickupArea/dropoffArea + own offer only
```

### 3.4 Submit Offer

```
POST /api/rides/{id}/offers
Auth: required
Permission: any user EXCEPT the requester

Request:
{
  price: number,      // required, integer, >= 1
  arrivalMin: number, // required, integer, 1-120
  message?: string    // optional, max 100 chars
}

Response 201:
{
  id: string,
  price: number,
  arrivalMin: number,
  message: string | null,
  status: "PENDING"
}

Validation:
- Ride status must be OPEN
- Driver ≠ requester
- Driver hasn't already submitted an offer (@@unique constraint)
- Price >= estimatedMinPrice * 0.3 (spam floor)
- Price <= estimatedMaxPrice * 3.0 (spam ceiling)
- Account age >= 3 days
- Rate limit: 10 offers per hour
```

### 3.5 Select Offer

```
POST /api/rides/{id}/select
Auth: required
Permission: requester only

Request:
{
  offerId: string  // required
}

Response 200:
{
  status: "SELECTED",
  confirmDeadline: string  // ISO datetime, now + 5 min
}

Side effects:
- Ride status → SELECTED
- Selected offer status → ACCEPTED
- All other offers status → PASSED
- confirmDeadline set to now + 5 minutes
- Notification sent to selected driver
- Notification sent to other drivers ("تم اختيار سائق آخر")
```

### 3.6 Driver Confirm

```
POST /api/rides/{id}/confirm
Auth: required
Permission: selected driver only

Response 200:
{
  status: "EN_ROUTE",
  trip: { id, agreedPrice, enRouteAt }
}

Validation:
- Ride status must be SELECTED
- Caller must be the selected offer's driver
- Must be within confirmDeadline

Side effects:
- Ride status → EN_ROUTE
- Trip record created
- confirmDeadline cleared
- Notification sent to requester
- Exact coordinates now visible to driver
```

### 3.7 Update Trip Status

```
POST /api/rides/{id}/status
Auth: required
Permission: depends on transition (see state machine)

Request:
{
  action: "arrived" | "start" | "complete" | "cancel" | "dispute",
  reason?: string  // required for cancel and dispute, max 200/500 chars
}

Response 200:
{
  status: string,  // new RideStatus
  trip: { ...updated fields }
}

Action mapping:
- "arrived":  EN_ROUTE → ARRIVED       (driver only)
- "start":    ARRIVED → IN_PROGRESS    (driver only)
- "complete": IN_PROGRESS → COMPLETED  (requester only)
- "cancel":   any active → CANCELLED   (either, with rules)
- "dispute":  IN_PROGRESS → DISPUTED   (either)

Cancel penalty rules:
- OPEN/SELECTED: free cancel, no penalty
- EN_ROUTE: -5 rep to canceller
- ARRIVED+: -10 rep to canceller
- IN_PROGRESS: -15 rep to canceller
```

### 3.8 Rate Trip

```
POST /api/rides/{id}/rate
Auth: required
Permission: requester or driver of this trip

Request:
{
  rating: number,     // 1-5, integer
  comment?: string    // optional, max 200 chars
}

Response 200:
{ success: true }

Validation:
- Trip status must be COMPLETED
- Caller must be requester or driver
- Caller hasn't already rated
- Must rate within 72 hours of completion

Side effects:
- Update Trip.requesterRating or Trip.driverRating
- Recalculate User.driverRatingAvg / driverRatingCount
- Award reputation: +25 to driver (completed trip), +5 to requester (if rated)
- If rating <= 2: flag for admin review
```

### 3.9 Ride Chat

Reuses existing Thread/Message system with a twist: thread is auto-created on EN_ROUTE (not manually).

```
GET  /api/rides/{id}/messages        // get chat messages
POST /api/rides/{id}/messages        // send message
Auth: required
Permission: requester or selected driver only
Condition: ride status must be EN_ROUTE, ARRIVED, IN_PROGRESS, or COMPLETED (within 1hr)

Request (POST):
{
  body: string,   // max 500 chars
  type?: "TEXT" | "LOCATION"
  lat?: number,
  lng?: number
}
```

---

## 4. Real-Time Event Map

Since the existing system uses polling, events are implemented as:
1. **Notification records** (persisted, shown in notification center)
2. **Polling endpoints** (client polls every 3-5 seconds on active rides)

Future: replace polling with WebSocket/SSE.

### 4.1 Events

| Event | Trigger | Recipients | Payload |
|-------|---------|-----------|---------|
| `offer:new` | New offer submitted | Requester | `{ rideId, offerId, price, arrivalMin, driverName }` |
| `offer:withdrawn` | Driver withdraws offer | Requester | `{ rideId, offerId }` |
| `ride:selected` | Requester picks offer | Selected driver | `{ rideId, offerId, confirmDeadline }` |
| `ride:selected` | Requester picks offer | Other drivers (PASSED) | `{ rideId, message: "تم اختيار سائق آخر" }` |
| `ride:confirmed` | Driver confirms | Requester | `{ rideId, tripId, driverName, driverPhone }` |
| `ride:timeout` | Driver didn't confirm in 5 min | Requester | `{ rideId, message: "reopened" }` |
| `ride:en_route` | Driver heading to pickup | Requester | `{ rideId }` |
| `ride:arrived` | Driver at pickup | Requester | `{ rideId }` |
| `ride:started` | Trip started | Both | `{ rideId, tripId }` |
| `ride:complete_requested` | Driver signals done | Requester | `{ rideId, autoCompleteAt }` |
| `ride:completed` | Trip confirmed complete | Both | `{ rideId, tripId }` |
| `ride:cancelled` | Trip cancelled | Other party | `{ rideId, cancelledBy, reason }` |
| `ride:expired` | Request expired | Requester | `{ rideId }` |
| `ride:disputed` | Dispute opened | Other party + admins | `{ rideId, disputedBy, reason }` |
| `ride:noshow` | Requester no-show at ARRIVED | Both | `{ rideId, message: "auto-cancelled" }` |
| `ride:message` | New chat message | Other party | `{ rideId, messageId, body }` |

### 4.2 Polling Endpoint

```
GET /api/rides/{id}/poll
Auth: required (requester or driver)
Response: { status, offerCount, trip, lastMessageAt, confirmDeadline }
```

Client polls this every 3 seconds when viewing an active ride. Cheap query (single row by PK + status).

---

## 5. Integration Plan with Existing Hai System

### 5.1 Modules Reused (no changes needed)

| Module | How It's Reused |
|--------|----------------|
| `src/lib/auth.ts` | Session/JWT for all ride APIs |
| `src/lib/db.ts` | Same Prisma client, same DB |
| `src/lib/notifications.ts` | `createNotification()` for all ride events |
| `src/lib/reputation.ts` | `addReputation()` for trip completion (+25 driver, +5 requester) |
| `src/lib/reputation-levels.ts` | `getRepLevel()` shown on driver offer cards |
| `src/lib/user-badge.ts` | Badges shown on driver profiles in offers |
| `src/lib/validation.ts` | Reuse text validation for notes/messages |
| `src/components/UserBadge.tsx` | Display badges on offer cards |
| `src/components/BottomNav.tsx` | Add rides tab (or link from feed) |
| `src/hooks/useLanguage.ts` | i18n for all ride UI |

### 5.2 Modules Reused with Minor Additions

| Module | Change |
|--------|--------|
| `prisma/schema.prisma` | Add 3 models + 2 enums + 4 fields on User |
| `src/lib/i18n.ts` | Add ~40 ride-related translation keys |
| `src/components/PostCard.tsx` | No change — rides are a separate feed, not posts |
| `src/app/api/notifications/` | No change — rides call existing `createNotification()` |

### 5.3 New Modules to Create

| Module | Purpose |
|--------|---------|
| `src/lib/rides/state-machine.ts` | Transition validator: `canTransition(current, target, callerRole)` |
| `src/lib/rides/pricing.ts` | Price estimation: `estimatePrice(distanceKm, durationMin, time)` |
| `src/lib/rides/distance.ts` | Haversine distance + duration estimate between 2 coords |
| `src/app/api/rides/route.ts` | POST create, GET list |
| `src/app/api/rides/mine/route.ts` | GET my requests + my offers |
| `src/app/api/rides/[id]/route.ts` | GET detail (privacy-filtered) |
| `src/app/api/rides/[id]/offers/route.ts` | POST submit offer, GET offers |
| `src/app/api/rides/[id]/select/route.ts` | POST select offer |
| `src/app/api/rides/[id]/confirm/route.ts` | POST driver confirm |
| `src/app/api/rides/[id]/status/route.ts` | POST status transitions |
| `src/app/api/rides/[id]/rate/route.ts` | POST rate trip |
| `src/app/api/rides/[id]/messages/route.ts` | GET/POST ride chat |
| `src/app/api/rides/[id]/poll/route.ts` | GET polling endpoint |
| `src/app/rides/page.tsx` | Rides feed page |
| `src/app/rides/new/page.tsx` | Create ride request |
| `src/app/rides/[id]/page.tsx` | Ride detail + offers + trip tracker |

### 5.4 Cron Job (New)

```
src/app/api/cron/rides/route.ts
```

Runs every 60 seconds (triggered by external cron or Vercel cron). Handles:
1. SELECTED → OPEN (confirm timeout, 5 min)
2. OPEN → EXPIRED (expiry deadline)
3. ARRIVED → CANCELLED (no-show, 10 min)
4. IN_PROGRESS → COMPLETED (auto-complete, 15 min after driver signals)

### 5.5 What Does NOT Need Refactoring

- Feed system — rides are separate from neighborhood posts
- Thread/DM system — rides have their own chat via `/api/rides/[id]/messages`
- Admin panel — add a "Rides" tab but existing admin action system works
- Post categories — RIDE_REQUEST category stays for simple "need a ride" posts; the new system is for the structured bidding flow

### 5.6 Existing RIDE_REQUEST Category

The existing `RIDE_REQUEST` post category is a simple text post ("أحتاج توصيلة للمطار"). The new rides system is a structured alternative. Both coexist:

- **RIDE_REQUEST post**: Casual, text-based, resolved via DM
- **Ride Request (new)**: Structured, map-based, bidding system

Users choose which to use. No migration needed.

---

## 6. Open Questions for Review

1. **Bottom nav**: Add a 🚗 rides tab (replacing one of the current 5), or access rides from feed header?
2. **Driver eligibility**: Should any user be able to offer rides, or require a "driver mode" toggle / verification?
3. **Payment**: Phase 1 is cash-only. When Moyasar is integrated, should the system hold escrow?
4. **Geographic scope**: Should rides be limited to same city, or cross-city allowed?
5. **Scheduled rides**: Show in feed immediately or only N hours before departure?

# HAI Rides — Ride Request Bidding System

## 1. Product Breakdown

### What It Is
A neighborhood-based ride-request marketplace where users post trip requests and drivers compete by submitting price offers. The requester picks the best offer, and a private trip lifecycle begins.

### How It Differs From Uber/Careem
- **No fixed pricing** — drivers bid freely
- **Transparency** — requester sees all offers with driver stats
- **Community-based** — operates within the Hai neighborhood trust system (reputation, ratings, badges)
- **No corporate fleet** — peer-to-peer, neighbor-to-neighbor

---

## 2. User Flows

### Flow A: Requester Creates a Ride

```
1. Tap "طلب توصيلة" from feed or bottom nav
2. Pick pickup location (map + GPS auto-detect)
3. Pick drop-off location (map + search)
4. System calculates: distance (km), duration (min), price range
5. Choose time: "الآن" (now) or scheduled (date/time picker)
6. Optional: add notes ("أمتعة كثيرة", "معي أطفال")
7. Review summary → Submit
8. Request goes OPEN → appears in Rides feed
9. Wait for offers (real-time updates)
10. Compare offers → Select one
11. Private chat opens → Trip lifecycle begins
```

### Flow B: Driver Submits an Offer

```
1. Browse Rides feed (see OPEN requests)
2. Tap a request → see distance, area, time
3. Tap "قدم عرض" → enter:
   - Price (SAR)
   - Estimated arrival time (minutes)
   - Optional message ("سيارة كامري 2024")
4. Submit → offer appears in requester's list
5. Wait for selection notification
6. If selected → confirm within 5 minutes
7. Private chat opens → navigate to pickup
```

### Flow C: Trip Lifecycle

```
OPEN → requester selects offer → SELECTED
SELECTED → driver confirms within 5 min → DRIVER_CONFIRMED
  (if no confirm in 5 min → auto-reopen → OPEN)
DRIVER_CONFIRMED → driver taps "في الطريق" → ON_THE_WAY
ON_THE_WAY → driver arrives, taps "وصلت" → ARRIVED
ARRIVED → requester boards, driver taps "بدأت الرحلة" → IN_PROGRESS
IN_PROGRESS → driver taps "وصلنا" → PENDING_COMPLETION
PENDING_COMPLETION → requester confirms → COMPLETED
  (if requester doesn't confirm in 15 min → auto-complete)
COMPLETED → both rate each other → CLOSED
```

---

## 3. UI Screens (Detailed)

### Screen 1: Rides Feed (`/rides`)
```
┌─────────────────────────┐
│ 🚗  التوصيلات    [+ طلب] │
├─────────────────────────┤
│ [طلباتي] [عروضي] [الكل] │
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ من: حي الزايدي       │ │
│ │ إلى: المسجد الحرام   │ │
│ │ 12 كم · ~18 دقيقة   │ │
│ │ ⏰ الآن              │ │
│ │ 💰 15-25 ريال (تقدير)│ │
│ │ 📨 3 عروض            │ │
│ │ [قدم عرض]            │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ من: حي الملك فهد     │ │
│ │ إلى: مطار جدة       │ │
│ │ 85 كم · ~55 دقيقة   │ │
│ │ ⏰ غداً 6:00 ص       │ │
│ │ 💰 80-120 ريال       │ │
│ │ 📨 1 عرض             │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

### Screen 2: Create Ride Request
```
┌─────────────────────────┐
│ ← طلب توصيلة جديد       │
├─────────────────────────┤
│  📍 نقطة الانطلاق       │
│  [خريطة + GPS auto]     │
│  حي الزايدي، شارع...    │
│                         │
│  📍 الوجهة              │
│  [خريطة + بحث]          │
│  المسجد الحرام          │
│                         │
│  ─────────────────────  │
│  📏 12.3 كم             │
│  ⏱ ~18 دقيقة           │
│  💰 تقدير: 15-25 ريال   │
│  ─────────────────────  │
│                         │
│  ⏰ متى؟                │
│  (●) الآن  ( ) موعد محدد│
│                         │
│  📝 ملاحظات (اختياري)   │
│  [                    ] │
│                         │
│  [████ نشر الطلب ████]  │
└─────────────────────────┘
```

### Screen 3: Offer Submission
```
┌─────────────────────────┐
│ ← تقديم عرض             │
├─────────────────────────┤
│  الرحلة: الزايدي → الحرم │
│  12.3 كم · ~18 دقيقة   │
│  التقدير: 15-25 ريال    │
│  ─────────────────────  │
│                         │
│  💰 سعرك                │
│  [     20    ] ريال     │
│                         │
│  ⏱ وقت الوصول المتوقع   │
│  [     8     ] دقيقة    │
│                         │
│  💬 رسالة قصيرة (اختياري)│
│  [كامري 2024، تكييف ممتاز]│
│                         │
│  [████ إرسال العرض ████] │
└─────────────────────────┘
```

### Screen 4: Offers Comparison (Requester View)
```
┌─────────────────────────┐
│ ← العروض (3)             │
├─────────────────────────┤
│ 💰 الأفضل سعراً    ───  │
│ ┌─────────────────────┐ │
│ │ أبو سلطان  ⭐ 4.8    │ │
│ │ 🚗 47 رحلة · 2% إلغاء│ │
│ │ 💰 18 ريال            │ │
│ │ ⏱ يصل خلال 5 دقائق   │ │
│ │ "هايلكس 2023"         │ │
│ │ [████ اختيار ████]    │ │
│ └─────────────────────┘ │
│                         │
│ ⚡ الأسرع وصولاً   ───  │
│ ┌─────────────────────┐ │
│ │ خالد  ✅ موثوق        │ │
│ │ 🚗 23 رحلة · 0% إلغاء│ │
│ │ 💰 22 ريال            │ │
│ │ ⏱ يصل خلال 3 دقائق   │ │
│ │ [████ اختيار ████]    │ │
│ └─────────────────────┘ │
│                         │
│ ┌─────────────────────┐ │
│ │ فهد  🔵 جديد          │ │
│ │ 🚗 5 رحلات · 10% إلغاء│ │
│ │ 💰 15 ريال            │ │
│ │ ⏱ يصل خلال 12 دقيقة  │ │
│ │ [████ اختيار ████]    │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

### Screen 5: Trip Status Tracker
```
┌─────────────────────────┐
│  الرحلة مع أبو سلطان    │
├─────────────────────────┤
│                         │
│  ● تم الاختيار     ✓    │
│  │                      │
│  ● السائق أكّد    ✓    │
│  │                      │
│  ● في الطريق      ◄──  │
│  │  يصل خلال 3 دقائق   │
│  │                      │
│  ○ بدأت الرحلة          │
│  │                      │
│  ○ وصلنا               │
│                         │
│  ─────────────────────  │
│  💰 18 ريال             │
│  📏 12.3 كم             │
│  ─────────────────────  │
│                         │
│  [💬 محادثة]  [❌ إلغاء] │
└─────────────────────────┘
```

### Screen 6: Rating Screen
```
┌─────────────────────────┐
│  تقييم الرحلة            │
├─────────────────────────┤
│                         │
│      أبو سلطان          │
│      ⭐⭐⭐⭐⭐           │
│                         │
│  كيف كانت الرحلة؟       │
│  [😊 ممتازة] [😐 عادية] │
│  [😞 سيئة]              │
│                         │
│  تعليق (اختياري)        │
│  [                    ] │
│                         │
│  [████ إرسال ████]      │
└─────────────────────────┘
```

---

## 4. Database Schema

### New Models

```prisma
// ─── Ride Requests ──────────────────────────────────────────────────────────

model RideRequest {
  id                String            @id @default(cuid())
  requesterId       String
  requester         User              @relation("rideRequests", fields: [requesterId], references: [id])

  // Locations — exact coords stored but only shown to selected driver
  pickupLat         Float
  pickupLng         Float
  pickupAddress     String            // full address (private)
  pickupArea        String            // district name only (public)
  dropoffLat        Float
  dropoffLng        Float
  dropoffAddress    String            // full address (private)
  dropoffArea       String            // district name only (public)

  // Calculated
  distanceKm        Float
  durationMin       Int
  estimatedMinPrice Int               // system-calculated range
  estimatedMaxPrice Int

  // Scheduling
  scheduledAt       DateTime?         // null = now
  notes             String?

  // State
  status            RideStatus        @default(OPEN)
  selectedOfferId   String?           @unique
  selectedOffer     RideOffer?        @relation("selectedOffer", fields: [selectedOfferId], references: [id])
  selectionDeadline DateTime?         // driver must confirm by this time

  // Timestamps
  expiresAt         DateTime          // auto-expire if no offers accepted
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  // Relations
  offers            RideOffer[]
  trip              Trip?
  neighborhoodId    String?

  @@index([status, createdAt])
  @@index([requesterId])
  @@index([neighborhoodId, status])
}

model RideOffer {
  id                String       @id @default(cuid())
  rideRequestId     String
  rideRequest       RideRequest  @relation(fields: [rideRequestId], references: [id])
  driverId          String
  driver            User         @relation("rideOffers", fields: [driverId], references: [id])

  price             Int          // SAR
  arrivalMin        Int          // estimated arrival in minutes
  message           String?      // optional short message
  status            OfferStatus  @default(PENDING)

  createdAt         DateTime     @default(now())

  // Reverse relation for selected offer
  selectedFor       RideRequest? @relation("selectedOffer")

  @@unique([rideRequestId, driverId])  // one offer per driver per request
  @@index([rideRequestId, status])
  @@index([driverId])
}

model Trip {
  id                String       @id @default(cuid())
  rideRequestId     String       @unique
  rideRequest       RideRequest  @relation(fields: [rideRequestId], references: [id])
  requesterId       String
  driverId          String

  status            TripStatus   @default(WAITING_CONFIRMATION)
  confirmedAt       DateTime?
  onTheWayAt        DateTime?
  arrivedAt         DateTime?
  startedAt         DateTime?
  completedAt       DateTime?
  cancelledAt       DateTime?
  cancelledBy       String?      // userId of who cancelled
  cancelReason      String?

  // Dispute
  disputeStatus     String?      // null | "requester_disputed" | "driver_disputed" | "resolved"
  disputeReason     String?
  disputeResolvedBy String?

  // Final
  finalPrice        Int          // agreed price from the offer
  requesterRating   Int?         // 1-5 rating given BY requester
  driverRating      Int?         // 1-5 rating given BY driver
  requesterComment  String?
  driverComment     String?

  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  @@index([requesterId])
  @@index([driverId])
  @@index([status])
}

// ─── Enums ──────────────────────────────────────────────────────────────────

enum RideStatus {
  OPEN              // accepting offers
  SELECTED          // requester picked a driver, waiting confirmation
  DRIVER_CONFIRMED  // driver confirmed
  ON_THE_WAY        // driver heading to pickup
  ARRIVED           // driver at pickup location
  IN_PROGRESS       // trip started
  PENDING_COMPLETION // driver says done, waiting requester confirm
  COMPLETED         // both confirmed
  CANCELLED         // cancelled by either party
  EXPIRED           // no offers or timed out
  DISPUTED          // dispute opened
}

enum OfferStatus {
  PENDING           // waiting for selection
  SELECTED          // this offer was chosen
  REJECTED          // another offer was chosen
  WITHDRAWN         // driver withdrew offer
  EXPIRED           // request expired
}

enum TripStatus {
  WAITING_CONFIRMATION
  CONFIRMED
  ON_THE_WAY
  ARRIVED
  IN_PROGRESS
  PENDING_COMPLETION
  COMPLETED
  CANCELLED
  DISPUTED
}
```

### User Model Additions
```prisma
// Add to existing User model:
  rideRequests     RideRequest[]  @relation("rideRequests")
  rideOffers       RideOffer[]    @relation("rideOffers")
  driverRating     Float?         // average rating as driver (1-5)
  requesterRating  Float?         // average rating as requester (1-5)
  completedTrips   Int            @default(0)
  cancelledTrips   Int            @default(0)
```

---

## 5. API Endpoints

### Ride Requests
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/rides` | Create ride request |
| GET | `/api/rides` | List OPEN rides (feed) with filters |
| GET | `/api/rides/mine` | My requests + my offers |
| GET | `/api/rides/[id]` | Get ride details (privacy-filtered) |
| PATCH | `/api/rides/[id]` | Cancel ride request |
| DELETE | `/api/rides/[id]` | Delete (only if OPEN, no offers) |

### Offers
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/rides/[id]/offers` | Submit offer on a ride |
| GET | `/api/rides/[id]/offers` | List offers (requester only sees all; drivers see own) |
| DELETE | `/api/rides/[id]/offers/[offerId]` | Withdraw offer |

### Selection & Trip
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/rides/[id]/select` | Select an offer (requester only) |
| POST | `/api/rides/[id]/confirm` | Driver confirms selection |
| POST | `/api/rides/[id]/status` | Update trip status (driver actions) |
| POST | `/api/rides/[id]/complete` | Requester confirms completion |
| POST | `/api/rides/[id]/cancel` | Cancel trip (either party) |
| POST | `/api/rides/[id]/dispute` | Open dispute |

### Ratings
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/rides/[id]/rate` | Rate the other party |

### Chat (reuse existing Thread system)
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/rides/[id]/messages` | Get ride chat messages |
| POST | `/api/rides/[id]/messages` | Send message in ride chat |

---

## 6. State Machine

```
                    ┌──────────┐
                    │   OPEN   │◄──── auto-reopen (driver didn't confirm)
                    └────┬─────┘
                         │ requester selects offer
                    ┌────▼─────┐
              ┌─────│ SELECTED │─────┐
              │     └────┬─────┘     │
              │          │           │ 5 min timeout
              │   driver confirms    │
              │     ┌────▼──────┐    │
              │     │ CONFIRMED │    ├──► OPEN (reopen)
              │     └────┬──────┘    │
              │          │           │
              │   driver: "في الطريق"│
              │     ┌────▼──────┐    │
              │     │ ON_THE_WAY│    │
              │     └────┬──────┘    │
              │          │           │
              │   driver: "وصلت"     │
              │     ┌────▼──────┐    │
              │     │  ARRIVED  │    │
              │     └────┬──────┘    │
              │          │           │
              │   driver: "بدأنا"    │
              │     ┌────▼──────┐    │
              │     │IN_PROGRESS│    │
              │     └────┬──────┘    │
              │          │           │
              │   driver: "وصلنا"    │
              │  ┌───────▼────────┐  │
              │  │PENDING_COMPLETE│  │
              │  └───────┬────────┘  │
              │          │           │
              │  requester confirms  │
              │  (or 15min auto)     │
              │    ┌─────▼──────┐    │
              │    │ COMPLETED  │    │
              │    └────────────┘    │
              │                      │
              │  ┌──────────┐        │
              ├──► CANCELLED│◄───────┘
              │  └──────────┘
              │  ┌──────────┐
              └──► DISPUTED │
                 └──────────┘

  Separately:
  OPEN ──(no offers in 2hr)──► EXPIRED
  OPEN ──(requester cancels)──► CANCELLED
```

---

## 7. Edge Case Handling

### Driver Selected But Doesn't Respond
- **Timeout**: 5 minutes after selection
- **Action**: Auto-revert to OPEN, notify requester "السائق لم يرد، طلبك مفتوح مرة أخرى"
- **Driver penalty**: +1 to no-response count, affects visibility

### Requester Cancels After Selection
- **Before driver confirms**: Free cancellation
- **After driver confirms**: Warning + logged (affects requester rating)
- **After IN_PROGRESS**: Counted as late cancel, -10 reputation

### Dispute: Driver Says Completed, Requester Disagrees
- Status → DISPUTED
- Both can submit evidence (text description)
- Admin reviews in admin panel (new "Rides Disputes" tab)
- Resolution options: complete (pay driver), cancel (refund), split

### Spam / Fake Offers
- Rate limit: Max 10 offers per hour per driver
- Min account age: 3 days to submit offers
- Offer price floor: Must be >= 30% of estimated min price
- Offer price ceiling: Must be <= 300% of estimated max price

### Unrealistic Pricing
- System shows warning if price is far below estimate
- Requester sees ⚠️ "سعر منخفض جداً" flag on cheap offers
- Doesn't block — just warns

### Auto-Expiry
- OPEN requests expire after 2 hours (immediate) or 30 min before scheduled time
- Scheduled requests appear in feed 2 hours before departure

---

## 8. Pricing Logic

### Estimation Formula
```
baseRate = 5 SAR (first 3 km included)
perKm = 1.5 SAR/km (after first 3 km)
perMin = 0.3 SAR/min (waiting/traffic)
timeMultiplier:
  - peak (7-9 AM, 4-7 PM): 1.3x
  - late night (11 PM - 5 AM): 1.5x
  - normal: 1.0x

estimated = (baseRate + (km - 3) * perKm + min * perMin) * timeMultiplier
minPrice = estimated * 0.7  (rounded)
maxPrice = estimated * 1.4  (rounded)
```

### Offer Highlights
- 💰 **Best Price**: Lowest price offer
- ⚡ **Fastest**: Shortest arrival time
- ⭐ **Top Rated**: Highest driver rating with 10+ trips

---

## 9. Notification Events

| Event | Recipient | Arabic | English |
|-------|-----------|--------|---------|
| New offer received | Requester | عرض جديد على طلبك | New offer on your ride |
| Offer selected | Driver | تم اختيارك! أكّد خلال 5 دقائق | You were selected! Confirm in 5 min |
| Driver confirmed | Requester | السائق أكّد — في الطريق قريباً | Driver confirmed |
| Driver on the way | Requester | السائق في الطريق إليك | Driver is on the way |
| Driver arrived | Requester | السائق وصل نقطة الانطلاق | Driver arrived at pickup |
| Trip started | Both | بدأت الرحلة | Trip started |
| Trip completed | Both | اكتملت الرحلة — قيّم تجربتك | Trip completed — rate your experience |
| Selection timeout | Requester | السائق لم يرد — طلبك مفتوح مجدداً | Driver didn't respond — request reopened |
| Ride cancelled | Other party | تم إلغاء الرحلة | Ride cancelled |
| Dispute opened | Other party | تم فتح نزاع على الرحلة | Dispute opened on trip |

---

## 10. Future Enhancements

1. **Live GPS tracking** — show driver location on map during ON_THE_WAY and IN_PROGRESS
2. **Favorite drivers** — requester can save preferred drivers
3. **Auto-match** — system suggests drivers based on history + proximity
4. **Recurring rides** — schedule weekly/daily commutes
5. **Group rides** — multiple passengers share a trip
6. **Driver documents** — upload license, vehicle registration for verification
7. **In-app payments** — Moyasar integration for seamless payment
8. **Trip history export** — download trip receipts
9. **Driver earnings dashboard** — track income, completed trips, ratings
10. **Surge indicators** — show high-demand areas/times

---

## Integration with Existing Hai Platform

- Rides feed accessible via new **bottom nav tab** or from feed
- Reuses existing: auth, notifications, reputation, user profiles, badges
- Driver rating feeds into Hai reputation system (+25 for completed ride)
- Chat reuses existing Thread/Message models with ride-specific context
- Admin panel gets new "Rides" tab for disputes and monitoring

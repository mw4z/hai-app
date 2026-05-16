# Hai (حي) — Neighborhood Social Platform

A structured, neighborhood-based community platform for Saudi Arabia. Built as a better alternative to unorganized WhatsApp groups — organized by district, reputation-driven, and trilingual (Arabic + English + Urdu).

**Target Cities**: Mecca, Jeddah, Riyadh

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TailwindCSS |
| Backend | Next.js API Routes (TypeScript) |
| Database | PostgreSQL + Prisma 7 ORM (PrismaPg adapter) |
| Auth | JWT (jose) + SMS OTP (Unifonic) |
| Maps | MapLibre GL + MapTiler (geocoding & tiles) + Photon (search fallback) |
| File Storage | Local filesystem (`/public/uploads`) |
| i18n | Custom trilingual system (AR/EN/UR) with cookie-based SSR |
| Location | Browser Geolocation API + polygon-based neighborhood detection |
| PWA | Web App Manifest, standalone mode, RTL Arabic-first |
| Logging | Structured console logger (src/lib/logger.ts) |
| Safety | Error boundaries, try/catch on all API routes |

---

## Project Structure

```
Hai - Project/
├── src/
│   ├── app/                          # Next.js App Route
 (25 page routes)
│   │   ├── layout.tsx                # Root layout (fonts, providers, theme, tour)
│   │   ├── page.tsx                  # Landing page
│   │   ├── globals.css               # Global styles + dark mode vars
│   │   ├── login/page.tsx            # Phone login
│   │   ├── register/page.tsx         # Phone registration
│   │   ├── verify/page.tsx           # OTP verification
│   │   ├── onboarding/page.tsx       # First-time setup (name, gender, location)
│   │   ├── feed/                     # Main neighborhood feed
│   │   │   ├── page.tsx              # Server component
│   │   │   └── FeedClient.tsx        # Client: posts, categories, filters, auto-refresh
│   │   ├── market/page.tsx           # Marketplace view
│   │   ├── services/page.tsx         # Services view
│   │   ├── post/
│   │   │   ├── new/page.tsx          # Create new post
│   │   │   └── [id]/pay/page.tsx     # Payment page (placeholder)
│   │   ├── threads/
│   │   │   ├── page.tsx              # DM threads list
│   │   │   └── [id]/page.tsx         # Individual chat
│   │   ├── rides/
│   │   │   ├── page.tsx              # Ride requests landing
│   │   │   ├── new/page.tsx          # Create ride request
│   │   │   └── [id]/
│   │   │       ├── page.tsx          # Ride detail (server)
│   │   │       └── RideDetailClient.tsx  # Phase-based ride UI
│   │   ├── notifications/page.tsx    # Notification center (swipe-to-delete)
│   │   ├── profile/
│   │   │   ├── page.tsx              # User profile (server)
│   │   │   ├── ProfileClient.tsx     # Profile UI (accordion sections)
│   │   │   ├── edit/page.tsx         # Profile edit
│   │   │   └── change-neighborhood/  # GPS-based neighborhood change
│   │   ├── admin/
│   │   │   ├── page.tsx              # Admin page (server)
│   │   │   └── AdminClient.tsx       # Admin dashboard (client)
│   │   ├── mod/
│   │   │   ├── page.tsx              # Mod dashboard (server)
│   │   │   └── ModDashboard.tsx      # Reports, hidden, banned, activity tabs
│   │   ├── contests/page.tsx         # Contests & prizes (coming soon)
│   │   ├── neighborhood-reports/     # Reports to neighborhood admin
│   │   ├── support/                  # Support tickets to developer
│   │   ├── terms/page.tsx            # Terms of service
│   │   ├── privacy/page.tsx          # Privacy policy
│   │   ├── error.tsx                 # Route-level error recovery
│   │   ├── global-error.tsx          # Root error boundary
│   │   ├── not-found.tsx             # 404 page
│   │   ├── loading.tsx               # Global loading spinner
│   │   └── api/                      # 65+ API endpoints (see below)
│   ├── components/
│   │   ├── PostCard.tsx              # Post card with reactions, comments, DM, edit/delete
│   │   ├── PollCard.tsx              # Poll voting with animated bars & reactions
│   │   ├── BottomNav.tsx             # Bottom navigation bar (5 tabs + badges)
│   │   ├── BackButton.tsx            # Uniform RTL-aware back button
│   │   ├── SwipeToDelete.tsx         # 3-phase swipe animation with haptic
│   │   ├── PullToRefresh.tsx         # Pull-to-refresh (guards map picker overlay)
│   │   ├── Tour.tsx                  # Multi-flow onboarding tour (5 flows, retry logic)
│   │   ├── AppSplash.tsx             # Splash screen (zoom-in dismiss, once per install)
│   │   ├── ErrorBoundary.tsx         # React error boundary with recovery UI
│   │   ├── ArrivalAlert.tsx          # Global ride arrival/selection alert overlay
│   │   ├── EmojiPickerWrapper.tsx    # Emoji reaction picker
│   │   ├── QuickAskSheet.tsx         # Quick post creation sheet
│   │   ├── RepToast.tsx              # Reputation change toast
│   │   ├── RiyalIcon.tsx             # Official Saudi Riyal SVG symbol (SAMA)
│   │   ├── UserBadge.tsx             # Verification check + tier label (separated)
│   │   └── rides/
│   │       ├── LocationPicker.tsx    # GPS pickup + search dropoff (MapTiler/Photon)
│   │       ├── openMapPicker.ts      # Vanilla JS fullscreen map picker (no React)
│   │       ├── MapPicker.tsx          # React map picker (deprecated)
│   │       ├── OfferCard.tsx         # Driver offer display card
│   │       ├── StatusBadge.tsx       # Ride status badge
│   │       └── Timeline.tsx          # Ride event timeline
│   ├── hooks/
│   │   ├── useLanguage.tsx           # Trilingual translation hook + LangProvider
│   │   ├── useAutoRefresh.ts         # Poll at intervals, pause on tab hide
│   │   ├── useGPSLocation.ts         # GPS location with confidence scoring
│   │   └── useRidePoll.ts            # Poll ride status every 3s, stop on terminal
│   └── lib/
│       ├── i18n.ts                   # 426+ trilingual translation keys (AR/EN/UR)
│       ├── auth.ts                   # JWT + session management
│       ├── db.ts                     # Prisma client initialization
│       ├── sms.ts                    # OTP generation + Unifonic SMS
│       ├── notifications.ts          # Notification creation with prefs
│       ├── reputation.ts             # Server-side rep with anti-gaming
│       ├── reputation-levels.ts      # Client-safe rep levels & benefits
│       ├── user-badge.ts             # Badge logic (account type + rep), trilingual
│       ├── haptic.ts                 # 6 haptic patterns (light/medium/heavy/success/error/warning)
│       ├── thread-rules.ts           # DM eligibility rules
│       ├── validation.ts             # Content + image validation
│       ├── logger.ts                 # Structured console logger
│       ├── api-handler.ts            # API wrapper (try/catch, Prisma errors, auth)
│       ├── env-check.ts              # Environment variable safety checks
│       ├── safe-fetch.ts             # Frontend fetch wrapper + debounce
│       ├── arrival-alert.ts          # Sound + vibration for ride alerts
│       ├── blocks.ts                 # User block helper (bidirectional filter)
│       ├── capabilities.ts           # Plan-based limits + entitlements (FREE/PREMIUM)
│       ├── usage.ts                  # Centralized usage tracking
│       ├── mod-safety.ts             # Mod probation, conflict detection, escalation
│       ├── mod-allocation.ts         # Dynamic mod capacity per neighborhood
│       ├── seed-service.ts           # Auto-seed sample content
│       ├── location/
│       │   ├── index.ts              # Location detection exports
│       │   ├── types.ts              # Location types
│       │   ├── polygon.ts            # Point-in-polygon algorithm
│       │   ├── web-collector.ts      # GPS sample collection
│       │   └── shared-decision.ts    # Best-sample decision logic
│       └── rides/
│           ├── state-machine.ts      # 11-state ride state machine
│           ├── distance.ts           # Haversine distance calculations
│           ├── pricing.ts            # Ride pricing logic
│           ├── events.ts             # Ride event audit trail
│           └── notify.ts             # Ride notification dispatch
├── prisma/
│   ├── schema.prisma                 # 34 database models
│   └── seed.ts                       # Database seeding
├── scripts/
│   └── fetch-boundaries.ts          # Fetch neighborhood polygons from Balady API
├── public/
│   ├── manifest.json                 # PWA manifest (AR, RTL, standalone)
│   ├── icon-192.svg                  # App icon
│   ├── icon-512.svg                  # Splash icon
│   └── uploads/                      # User-uploaded images
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## API Endpoints (56 total)

### Authentication (4)
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/auth/send-otp` | Send 6-digit OTP to Saudi phone (rate: 3/10min, 5/hr) |
| POST | `/api/auth/verify-otp` | Verify OTP, create JWT session (30-day), brute-force protected |
| POST | `/api/auth/complete-profile` | Set name, gender, accountType, neighborhood |
| POST | `/api/auth/logout` | Delete session cookie |

### Posts & Feed (8)
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/posts` | Get paginated feed (20/page) with scoring |
| POST | `/api/posts` | Create post (title, body, category, price, images) |
| GET/PUT/DELETE | `/api/posts/[id]` | Get, update, or delete a post |
| GET | `/api/feed` | Scored feed with dedup + commercial balance |
| POST | `/api/posts/[id]/react` | Add/update/remove emoji reaction |
| GET/POST | `/api/posts/[id]/comments` | Get threaded comments / add comment (rate: 10/min) |
| POST | `/api/posts/[id]/activate` | Activate paid post |
| POST | `/api/posts/report` | Report post (auto-hide at threshold) |

### Comments (1)
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/comments/[id]/like` | Toggle like on comment (+2 rep) |

### Polls & Voting (5)
| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/polls` | List / create polls (admin-only creation) |
| GET/PUT/DELETE | `/api/polls/[id]` | Get, update, or delete poll |
| POST | `/api/polls/[id]/vote` | Cast vote on poll option |
| POST | `/api/polls/[id]/react` | React to poll with emoji |
| GET/POST | `/api/polls/[id]/comments` | Get / add poll comments |

### Rides System (10)
| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/rides` | List ride requests / create new ride request |
| GET/PUT | `/api/rides/[id]` | Get ride details / update ride |
| GET | `/api/rides/mine` | Get user's rides (as requester or driver) |
| GET/POST | `/api/rides/[id]/offers` | List offers / submit driver offer |
| POST | `/api/rides/[id]/select` | Requester selects a driver offer |
| POST | `/api/rides/[id]/confirm` | Confirm arrival / pickup / dropoff |
| POST | `/api/rides/[id]/messages` | Send in-ride chat message |
| POST | `/api/rides/[id]/status` | Update ride status (cancel, dispute, etc.) |
| POST | `/api/rides/[id]/rate` | Rate driver or requester after trip |
| GET/POST | `/api/rides/[id]/poll` | Poll ride status (+ inline timeout handling) |

### Threads / DMs (5)
| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/threads` | List user's threads / create or get existing |
| GET/PUT | `/api/threads/[id]` | Get thread / update thread |
| GET/POST | `/api/threads/[id]/messages` | Get messages (max 100) / send text or location |
| POST | `/api/threads/[id]/close` | Close thread + rep award |
| POST | `/api/threads/[id]/rate` | Rate participant (weighted by rater rep) |

### Notifications (5)
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/notifications` | Get paginated notifications (20/page) |
| POST | `/api/notifications/read` | Mark as read |
| POST | `/api/notifications/delete` | Delete a notification |
| GET | `/api/notifications/unread` | Get unread counts (messages vs other) |
| PATCH | `/api/notifications/settings` | Update notification preferences |

### Profile & Account (10)
| Method | Route | Purpose |
|--------|-------|---------|
| GET/PATCH | `/api/profile` | Get / update profile (name, avatar, cover, email, bio, service info) |
| GET | `/api/profile/reputation` | Get rep score + recent activity log |
| GET | `/api/profile/rep-check` | Get current rep total (for toast) |
| POST | `/api/profile/verify-provider` | Request provider verification |
| POST | `/api/profile/change-neighborhood` | Change neighborhood (GPS-only, 2 free/month) |
| POST | `/api/profile/change-phone` | Change phone with OTP verification |
| POST | `/api/profile/send-email-verify` | Send email verification code |
| POST | `/api/profile/verify-email` | Verify email with 6-digit code |
| DELETE | `/api/account/delete` | Self-service account deletion (soft delete + anonymize) |
| GET | `/api/legal` | Legal URLs (privacy, terms, support, data deletion) |

### Service Catalog (3)
| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST/PATCH/DELETE | `/api/service-items` | CRUD for provider catalog items |
| GET | `/api/service-items/mine` | Get own catalog items (for management) |

### User Safety (2)
| Method | Route | Purpose |
|--------|-------|---------|
| POST/DELETE/GET | `/api/users/block` | Block, unblock, list blocked users |

### Neighborhoods & Cities (2)
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/neighborhoods/detect` | Detect neighborhood from GPS (polygon matching) |
| GET | `/api/cities` | List all cities with neighborhoods |

### Community & Support (4)
| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/mod-request` | Check status / apply for neighborhood mod |
| POST | `/api/neighborhood-report` | Report to neighborhood admin |
| POST | `/api/neighborhood-admin` | Admin responses to reports |
| POST | `/api/support` | Submit support ticket to developer |

### Admin (8)
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/admin/dashboard` | Admin stats overview |
| POST | `/api/admin/action` | Moderation actions (hide, ban, role change, plan change, etc.) |
| GET | `/api/admin/lists` | Filterable lists (posts, users, reports, mod requests) |
| POST | `/api/admin/moderate` | Post moderation |
| POST | `/api/admin/escalate` | Mod escalation to platform admins |
| GET/POST | `/api/admin/neighborhood-requests` | Manage neighborhood transfer approvals |
| POST | `/api/admin/seed` | Seed demo data |

### Utilities (2)
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/upload` | Upload images (max 5MB, 5 files, magic byte validation) |
| POST | `/api/cron/rides` | Ride timeout handling (confirm, no-show, auto-complete, expiry) |

---

## Database Models (34 models)

### User & Auth
- **User** — id, phone, name, lastName, email, emailVerified, gender (MALE/FEMALE/UNSPECIFIED), avatarUrl, coverUrl, reputation, role, status, accountType, plan (FREE/PREMIUM), neighborhoodId, bio, serviceDescription, serviceAddress, serviceLat/Lng, modApprovedAt, deletedAt, notification prefs (comments/reactions/replies/lookingFor/messages/rides/system), driverRatingAvg, driverTripsCount, driverCancelCount
- **OtpCode** — id, code, expiresAt, attempts, userId

### Geographic
- **City** — id, name, nameEn
- **Neighborhood** — id, name, nameEn, lat, lng, boundary (GeoJSON polygon), bbox, source (balady/community), baladyId, cityId
- **Compound** — id, name, type (APARTMENT/VILLA_COMPOUND/MIXED)

### Content
- **Post** — id, title, body, category, status, price, imageUrls[], isPaid, isPinned, isFeatured, coordinationMode, reportCount, expiresAt, editedAt
- **Comment** — id, body, authorId, postId, parentId (threaded replies)
- **CommentLike** — id, userId, commentId
- **Reaction** — id, emoji, userId, postId (1 per user per post)
- **Report** — id, reason, reporterId, postId, status

### Polls & Voting
- **Poll** — id, question, options[], authorId, neighborhoodId, expiresAt
- **PollVote** — id, pollId, optionIndex, voterId
- **PollComment** — id, body, pollId, authorId
- **PollReaction** — id, emoji, pollId, userId

### Rides System
- **RideRequest** — id, pickupLat/Lng, pickupAddress, dropoffLat/Lng, dropoffAddress, status (11 states), requesterId, notes, expiresAt
- **RideOffer** — id, rideRequestId, driverId, price, arrivalMinutes, message, status
- **Trip** — id, rideRequestId, driverId, riderId, status, startedAt, completedAt
- **RideRating** — id, tripId, raterId, ratedId, score, comment
- **RideDispute** — id, tripId, raisedById, reason, status, resolution
- **RideEvent** — id, rideRequestId, action, actorId, details, createdAt
- **RideMessage** — id, rideRequestId, senderId, body, type (TEXT/LOCATION/IMAGE), imageUrl, lat, lng, createdAt

### Communication
- **Thread** — id, user1Id, user2Id, postId, status (OPEN/CLOSED), coordinationMode
- **Message** — id, text, type (TEXT/LOCATION/IMAGE), lat, lng, imageUrl, senderId, threadId
- **Notification** — id, type, title, titleEn, body, bodyEn, read, userId, actorId, postId, threadId, action

### Reputation & Moderation
- **ReputationLog** — id, userId, action, points, fromUserId, postId
- **ModerationLog** — id, adminId, action, targetType, targetId, reason, details
- **ModRequest** — id, userId, neighborhoodId, reason, status, reviewedBy
- **VerificationRequest** — id, userId, businessName, description, status, reviewedBy

### Neighborhood Management
- **NeighborhoodChangeRequest** — id, userId, from/to neighborhoodId, reason, status
- **NeighborhoodChangeLog** — id, userId, from/to neighborhoodId, changedBy
- **NeighborhoodReport** — id, userId, neighborhoodId, body, imageUrls, status, adminReply

### Service Providers
- **ServiceItem** — id, userId, title, description, price, imageUrl, sortOrder, active

### User Safety
- **UserBlock** — id, blockerId, blockedId (unique pair, bidirectional filtering)

### Monetization (Internal)
- **UsageCounter** — id, userId, feature, count, windowStart (daily/permanent)
- **PlanChangeLog** — id, userId, previousPlan, newPlan, changedBy, reason

### Support
- **SupportTicket** — id, userId, subject, body, imageUrls, status, adminReply

### B2B (Compounds)
- **Announcement** — id, title, body, compoundId
- **MaintenanceRequest** — id, title, body, status, priority, compoundId, userId
- **Payment** — id, amount, currency, status, moyasarId, userId, postId

---

## Post Categories (13)

| Key | Arabic | English | Icon | Threadable |
|-----|--------|---------|------|------------|
| ALERT | تنبيه أمني أو عام | Security Alert | 🔔 | No |
| NEIGHBORHOOD_ISSUE | مشكلة في الحي | Neighborhood Issue | ⚠️ | No |
| LOST_FOUND | مفقودات أو موجودات | Lost & Found | 🔍 | No |
| LOOKING_FOR | أبحث عن... | Looking For | 🔎 | Yes |
| RIDE_REQUEST | طلب مشوار | Ride Request | 🚗 | Yes |
| MARKETPLACE | بيع / شراء | Buy / Sell | 🛒 | Yes |
| FOOD_HOME | الأسر المنتجة | Home Food | 🍱 | Yes |
| REAL_ESTATE | عقارات | Real Estate | 🏠 | Yes |
| SERVICES | خدمة | Services | 🔧 | Yes |
| MOSQUE | إعلان مسجد | Mosque | 🕌 | No |
| EVENTS | فعاليات | Events | 🎉 | No |
| CONTESTS | مسابقات وجوائز | Contests & Prizes | 🏆 | No (admin-only, coming soon) |
| GENERAL | عام | General | 💬 | No |

---

## Ride System (Community Coordination)

### State Machine (11 states)
```
RIDE_OPEN → RIDE_OFFERED → RIDE_ACCEPTED → RIDE_DRIVER_EN_ROUTE →
RIDE_ARRIVED → RIDE_IN_PROGRESS → RIDE_PENDING_COMPLETION → RIDE_COMPLETED
                                                          ↗
Side states: RIDE_CANCELLED, RIDE_EXPIRED, RIDE_DISPUTED
```

### Ride Flow
1. Requester creates ride request (pickup GPS + dropoff search/map)
2. Drivers see request and submit offers (arrival time + optional message)
3. Requester reviews offers and selects one → both notified
4. Driver confirms departure → Google Maps opens to pickup
5. Driver arrives → requester notified
6. Driver starts trip → Google Maps opens to dropoff
7. Requester confirms completion (or auto-completes after timeout)
8. Both parties rate each other

### Key Features
- **Offers appear in feed** as regular posts (category: RIDE_REQUEST)
- **In-ride chat** anchored at bottom, dark mode trip UI
- **Google Maps integration** opens navigation on status change buttons
- **Inline timeout handling** via poll endpoint (no external cron needed)
- **Cancel penalties** after agreement stage
- **Dispute system** with admin resolution
- **Notifications** at every status transition for both parties

### Location Picker
- GPS auto-detect for pickup
- MapTiler geocoding + Photon fallback for dropoff search
- Vanilla JS fullscreen map picker (bypasses React to prevent re-render crashes)
- `data-overlay="true"` attribute prevents PullToRefresh from triggering

---

## User Roles (5-level hierarchy)

| Role | Scope | Can Do |
|------|-------|--------|
| RESIDENT | Own neighborhood | Post, comment, react, report, DM, ride requests |
| NEIGHBORHOOD_MOD | Assigned neighborhood | + hide/restore posts, temp ban users |
| COMPOUND_ADMIN | Assigned compound | Manage compound announcements & maintenance |
| PLATFORM_MOD | All neighborhoods | + remove posts, global ban |
| SUPER_ADMIN | Entire platform | + change roles, delete users, approve mods, create polls |

**Becoming a Mod**: Residents with 7+ day account and 20+ reputation can apply via profile. SUPER_ADMIN approves/rejects.

---

## Reputation System

### Tiers & Benefits

| Tier | Points | Visual | Daily Posts | Report Weight | Feed Boost | Rating Weight |
|------|--------|--------|-------------|---------------|------------|---------------|
| New (جديد) | 0-49 | gray pill | 3 | 1.0x | 0 | 1.0x |
| Active (نشط) | 50-149 | blue pill | 5 | 1.0x | 1.2 | 1.0x |
| Trusted (موثوق) | 150-399 | green pill | 8 | 1.2x | 1.5 | 1.1x |
| Distinguished (عضو مميز) | 400+ | amber pill | 12 | 1.4x | 1.8 | 1.2x |

Visual: verification ✓ (blue, inline with name) is separate from tier pill (below name, next to timestamp).

### Point Awards (Rebalanced)

| Action | Points | Notes |
|--------|--------|-------|
| Ride completed | +12 | Real trust signal |
| Service completed | +10 | Via thread completion |
| Positive rating | +6 | Weighted by rater |
| Comment liked | +1 | Minor signal |
| Reaction received | 0 | Removed — too easy to farm |
| Report confirmed | -20 | Post auto-hidden |
| Spam detected | -30 | Duplicate content |
| Negative rating | -10 | Weighted |
| Ride cancel after agreement | -15 | Penalty for late cancellation |

### Anti-Gaming
- **Pair limit**: Max 2 interactions between same 2 users/day
- **Daily cap**: Max 12 positive points/day
- **Diminishing returns**: Per action type per day — first 3 full, next 3 half, then 0
- **New user weight**: Accounts < 7 days give 0.5x points
- **Feed boost**: Deterministic per tier (not formula), subtle — content quality matters more
- **Report system**: Weighted threshold (4.0 points) instead of fixed count

---

## Badge & Identity System

### Inline with Name (Identity)
| Badge | Condition | Visual |
|-------|-----------|--------|
| Blue ✓ | VERIFIED_PROVIDER | Blue SVG checkmark (X/Twitter style) |
| 🛠 | SERVICE_PROVIDER | Emoji only (no check) |
| 🏅 | NEIGHBORHOOD_MOD | Medal emoji |
| 👑 | SUPER_ADMIN | Crown emoji |

### Below Name (Reputation Tier)
| Tier | Visual | Color |
|------|--------|-------|
| جديد / New | Pill label | Gray |
| نشط / Active | Pill label | Blue |
| موثوق / Trusted | Pill label | Green |
| عضو مميز / Distinguished | Pill label | Amber |

### Boosted Content
| Label | Usage |
|-------|-------|
| بارز / Featured | Subtle gray pill next to timestamp on boosted posts |

---

## Thread / DM System

### Eligible Categories
SERVICES, LOOKING_FOR, RIDE_REQUEST, MARKETPLACE, FOOD_HOME, REAL_ESTATE

### Coordination Modes
- **OPEN**: Multiple threads per post (marketplace, services)
- **EXCLUSIVE**: One active thread (ride requests — first come, first served)

### Lifecycle
1. User taps DM on eligible post → thread created
2. Exchange TEXT or LOCATION messages
3. Either user closes thread
4. Post author rates helper (positive/neutral/negative)
5. Helper receives reputation based on rating (weighted)

---

## Poll / Voting System

- **Admin-only creation**: Only SUPER_ADMIN and NEIGHBORHOOD_MOD can create polls
- **Animated percentage bars** with real-time vote tracking
- **Emoji reactions** (👍❤️😂🙏) on polls
- **Inline comments** with author delete
- **Dark mode compatible** bars (blue-tinted for visibility)
- **Vote signature tracking** for real-time UI updates without refetch
- Polls appear in the main feed alongside regular posts

---

## Feed & Real-Time Updates

### Scoring Algorithm
```
score = (50 + engagement + typeBoost + repBoost) / (hoursAgo + 2)
```
- **engagement**: reactions + comments * 2
- **typeBoost**: alerts & issues get +20, looking_for +10
- **repBoost**: `log2(authorRep + 1) * 0.4`
- **Deduplication**: Max 2 posts per author in feed
- **Commercial balance**: Marketplace/services capped at 30% of feed

### Auto-Refresh Polling
| Feature | Interval | Notes |
|---------|----------|-------|
| Feed | 5 seconds | Pauses on tab hide, resumes on focus |
| Notifications | 5 seconds | Badge counts in bottom nav |
| Ride status | 3 seconds | Stops on terminal states |
| Threads | 10 seconds | Message polling |

### Slide-in Animations
New posts entering the feed use slide-in motion (not static append).

---

## Profile Page (Accordion Layout)

Organized with collapsible accordion sections to reduce clutter:

**Always visible:**
- Header (cover photo, avatar, name, badge, neighborhood)
- Stats bar (reputation points, posts count, join year)

**Quick links (above accordion):**
- Mod Dashboard card (mods only, links to `/mod`)
- Service Catalog card (providers only, links to `/profile/catalog`)

**Collapsible sections (one open at a time):**
1. **Reputation** — tier progress bar with color, recent activity, tips
2. **Bio / About** — free-text bio (300 chars) + service description/location (providers)
3. **Account** — name (letters only), phone, email (with verification), change neighborhood
4. **Settings** — language (AR/EN/UR), theme (light/dark/system)
5. **Notifications** — 7 toggles in 4 groups with icons and descriptions
6. **Help & More** — mod request, terms/privacy, restart tour, neighborhood reports, app support

**Always visible at bottom:**
- Admin Control Panel button (admin roles only)
- Logout button
- Delete Account link (App Store/Google Play compliance)

---

## Onboarding Tour (5 Flows)

| Flow | Steps | Trigger |
|------|-------|---------|
| Global | 3 (welcome, create post, interact) | Auto on first feed visit |
| Ride Create | 3 (pickup, dropoff, submit) | Auto on `/rides/new` |
| Ride Detail | 3 (offers, select, status) | Auto on ride detail |
| Post Create | 3 (category, content, images) | Auto on `/post/new` |
| Chat | 3 (messages, location, close) | Auto on thread |

- SVG mask overlay with green glow border, smart tooltip positioning
- **Retry logic**: Waits up to 2.5s for elements to render before skipping
- **Skip loop prevention**: Ends tour if all steps are missing
- localStorage per flow (each shows once), all reset on new account creation
- Can be restarted from profile settings

## Splash Screen

- Shows once per install (localStorage)
- Icon + brand + loading dots animation
- Dismiss: zoom-in + fade (450ms linear)
- Auto-dismiss after content loads (min 1.8s, max 3s)

## Landing Page

- Rotating tagline: 5 phrases per language, cycling every 2s
- Language switcher: العربية / English / اردو (on landing, login, register)
- Copy: "اعرف جيرانك، وخلّ جيرانك يعرفونك"

---

## Notification System

- **Swipe-to-delete** with 3-phase animation (swiping → deleting → gone) + haptic feedback
- **RTL-aware**: Arabic swipes left-to-right, English right-to-left
- **Unread badges** on bottom nav (messages count separate from other notifications)
- **7 notification controls** in 4 groups: Posts (💬😊↩️), Messages (✉️), Rides (🚗), Neighborhood/System (🔎🔔)
- **Ride notifications** at every status transition for both parties
- **Global arrival alert**: Full-screen overlay + sound + vibration when driver arrives or offer accepted (works on any page, polls every 8s)

---

## Support & Reports

### Support Tickets (to app developer)
- Available to all users except SUPER_ADMIN
- Subject, body, image uploads
- Admin reply system
- Accessible from profile → Help & More

### Neighborhood Reports (to neighborhood admin)
- Available to RESIDENT users only
- Report or suggestion to neighborhood moderator
- Body, image uploads, admin reply
- Accessible from profile → Help & More

### Mod Request System
- Residents with 7+ days and 20+ rep can apply
- Requires written reason (min 10 chars)
- Status tracking: pending → approved/rejected
- SUPER_ADMIN reviews via admin dashboard
- **Auto-approval**: If neighborhood has 0 mods + user has 50+ rep + 14+ day account
- **Dynamic allocation**: Mod capacity scales with neighborhood activity (LOW: 1, MEDIUM: 2-3, HIGH: 3-5)
- Feed banner: "حيّك يحتاج مشرف" when neighborhood has no active mods (shows 3 times, dismissable)

### Mod Safety Layer
- **Probation**: First 48h — cannot permanently ban or remove posts
- **Permanent scope**: NEIGHBORHOOD_MOD can never ban_user, remove_post, or delete_user
- **Rate limiting**: Max 15 actions/hour
- **Conflict of interest**: Blocked if mod owns post, has recent chat with author, commented, is competitor, or reported the post
- **Escalation**: Mods can escalate to platform admins when blocked by conflict (max 5/hour, no duplicates)
- **Rep rewards**: +1-2 per valid action, daily cap 10, only if post has reports
- **Mod dashboard**: `/mod` with reports queue, hidden posts, banned users, activity log

---

## Haptic Feedback

6 vibration patterns using the Vibration API:
| Pattern | Duration | Usage |
|---------|----------|-------|
| Light | 10ms | Button taps, tour navigation |
| Medium | 25ms | Reactions, voting |
| Heavy | 50ms | Important actions |
| Success | 10-30-10ms | Completion events |
| Error | 30-50-30ms | Error feedback |
| Warning | 20-30-20ms | Caution actions |

---

## Neighborhood Detection

1. Browser Geolocation API collects multiple GPS samples
2. Best sample selected by accuracy + confidence
3. Point-in-polygon ray-casting algorithm tests against Balady boundary polygons
4. Returns neighborhood + confidence level (HIGH/MEDIUM/LOW)
5. Fallback: manual selection from sorted list (nearest first)

**Data source**: Balady government API (`umaps.balady.gov.sa`) + community-defined polygons

---

## Internationalization (Trilingual)

- **426+ translation keys** in `src/lib/i18n.ts`
- **3 languages**: Arabic (primary), English, Urdu
- Cookie-based language switching (`hai_language`)
- SSR-compatible via `LangProvider` context
- RTL layout for Arabic & Urdu, LTR for English
- Every UI string has `ar`, `en`, and `ur` values
- User badges and reputation levels are trilingual

---

## Dark Mode

- CSS class-based (`dark:` Tailwind variants)
- 3 options: Light / Dark / System
- Stored in `localStorage` (`hai_theme`)
- Inline script in `<head>` prevents flash of wrong theme
- Custom CSS variables for both modes in `globals.css`

---

## Security

### Authentication
- SMS OTP: 6-digit, 10-min expiry, Saudi phone validation (accepts 05xx or 5xx)
- Rate limiting: 3 OTPs/10min, 5/hour per phone
- Brute force: 5 failed attempts → 15-min lockout
- JWT: 30-day, httpOnly, secure, SameSite=lax cookies

### Content
- Input validation (length, real text, excessive repetition)
- Image magic byte verification (JPEG/PNG/WebP only)
- Duplicate post detection (last 3 hours)
- Post cooldown: 60 seconds between posts
- Upload rate limit: 10 files/minute

### Admin
- Role hierarchy enforced (mods can't affect higher roles)
- SUPER_ADMIN can't be banned/deleted
- All admin actions logged in ModerationLog
- Neighborhood mods scoped to their neighborhood only
- `getActorRole()` checks participant roles before admin role (prevents 409 errors)

---

## Service Provider Catalog

- Providers can add up to 3 items (FREE) / 20 (PREMIUM)
- Each item: title, description, price, photo
- 2-column grid display in profile popup
- Tap item → bottom sheet detail with "تواصل لطلب الخدمة" CTA → opens thread
- Management page at `/profile/catalog`

---

## User Safety & Compliance (App Store Ready)

| Feature | Status |
|---------|--------|
| Report posts | ✅ Auto-moderation with rep-based thresholds |
| Block users | ✅ Bidirectional filtering (feed, threads, thread creation) |
| Account deletion | ✅ Self-service soft delete + data anonymization |
| Privacy policy | ✅ Bilingual page at `/privacy` |
| Terms of service | ✅ Bilingual page at `/terms` |
| Legal endpoint | ✅ `GET /api/legal` |
| Rate limiting | ✅ Posts, reports, uploads, mod actions, OTP |
| Content validation | ✅ Length, real text, duplicate detection |
| Image validation | ✅ Magic byte verification (JPEG/PNG/WebP) |
| Gender option | ✅ Male / Female / Prefer not to say |

---

## Monetization Foundation (Internal Only)

| Component | Description |
|-----------|-------------|
| `user.plan` | FREE (default) or PREMIUM — never shown in UI |
| `capabilities.ts` | Centralized limits + boolean entitlements |
| `UsageCounter` | Per-user, per-feature, per-time-window tracking |
| `PlanChangeLog` | Audit trail for every plan change |
| Limit messages | Neutral: "وصلت الحد الأقصى حالياً" — never "upgrade" |
| Admin action | `change_plan` with full audit |

### FREE vs PREMIUM Limits

| Feature | FREE | PREMIUM |
|---------|------|---------|
| Posts/day | 3 | 10 |
| Ride offers/day | 3 | 20 |
| Catalog items | 3 | 20 |
| Threads/day | 6 | 50 |
| Uploads/day | 7 | 30 |
| Feed boost | 1.0x | 1.3x |
| Feature listings | No | Yes |
| Priority search | No | Yes |
| Reorder catalog | No | Yes |
| Boost posts | No | Yes |

---

## PWA Configuration

```json
{
  "name": "حي - Hai",
  "short_name": "حي",
  "display": "standalone",
  "lang": "ar",
  "dir": "rtl",
  "theme_color": "#15803d",
  "categories": ["social", "lifestyle"]
}
```

## App Icon

Minimal geometric design: 1 center circle (hub) + 3 outer circles (neighbors) in equilateral triangle on `#15803d` green. Same SVG used for PWA icon (192/512), splash screen, and landing page.

---

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@host:5432/hai_db
JWT_SECRET=<secure-random-string>
UNIFONIC_APP_SID=<unifonic-api-key>
UNIFONIC_SENDER_ID=Hai
NEXT_PUBLIC_APP_URL=https://your-domain.com
OTP_EXPIRY_MINUTES=10
```

---

## Scripts

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npx prisma db push   # Apply schema changes
npx prisma studio    # Visual DB explorer
npx prisma generate  # Generate Prisma client
npx tsx scripts/fetch-boundaries.ts  # Import neighborhood polygons from Balady
```

---

## Dependencies

### Production
- `next` 14.2.4 — React framework
- `react` / `react-dom` ^18 — UI library
- `@prisma/client` ^7.5.0 — ORM
- `@prisma/adapter-pg` ^7.5.0 — PostgreSQL adapter
- `pg` ^8.20.0 — PostgreSQL driver
- `jose` ^5.6.3 — JWT signing/verification
- `bcryptjs` ^2.4.3 — Password hashing
- `react-hot-toast` ^2.4.1 — Toast notifications
- `react-icons` ^5.2.1 — Icon library (Feather Icons)
- `@emoji-mart/react` ^1.1.1 — Emoji picker
- `@emoji-mart/data` ^1.2.1 — Emoji data
- `maplibre-gl` ^5.21.1 — Map rendering

### Dev
- `typescript` ^5 — Type safety
- `tailwindcss` ^3.4 — Utility CSS
- `prisma` ^7.5.0 — ORM CLI
- `tsx` ^4.21.0 — TypeScript execution
- `@types/react` / `@types/node` — Type definitions

---

## Pre-Launch Checklist

### Critical (Blocking)
- [ ] Cloud PostgreSQL (Neon / Supabase / AWS RDS)
- [ ] Cloud image storage (S3 / Cloudinary)
- [ ] Real SMS credentials (Unifonic production key)
- [ ] Rotate JWT secret + DB password
- [ ] Security headers (CSP, HSTS, X-Frame-Options)
- [ ] Deploy to Vercel / cloud hosting
- [ ] Capacitor wrapper for iOS App Store & Google Play

### Important
- [ ] Moyasar payment integration
- [ ] Error tracking (Sentry)
- [ ] Analytics (PostHog / Mixpanel)
- [ ] Service worker for offline support
- [ ] WebSocket for real-time (replace polling)
- [ ] Redis-based rate limiting
- [ ] CI/CD pipeline
- [ ] Prisma migrations (replace db push)

### Nice to Have
- [ ] Image moderation AI
- [ ] Push notifications (FCM / APNs)
- [ ] Post detail page (`/post/[id]`)
- [ ] Search functionality
- [ ] Structured logging (Winston / Pino)
- [ ] Load testing

---

## License

Private — All rights reserved.

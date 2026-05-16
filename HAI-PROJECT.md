# Hai (حي) — Neighborhood Social Platform

A structured, neighborhood-based community platform for Saudi Arabia. Built as a better alternative to unorganized WhatsApp groups — organized by district, reputation-driven, trilingual (Arabic + English + Urdu), and shipped as a real mobile app via Capacitor (iOS App Store + Google Play).

**Target Cities**: Mecca, Jeddah, Riyadh (KSA — production hosted on Vercel, app gated to KSA installs).

**Current Release**: iOS `1.1.6 (50)` · Android `1.1.6 (51)`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TailwindCSS |
| Backend | Next.js API Routes (TypeScript), Vercel Functions |
| Database | Supabase Postgres + Prisma 7 ORM (PrismaPg adapter) |
| Auth | JWT (jose, 7-day) + SMS OTP via Twilio Verify (KSA-scoped) |
| Mobile | Capacitor 8 (iOS + Android) wrapping the live web app at `https://app.hai-app.net` |
| Push | FCM v1 + direct APNs HTTP/2 (no Firebase APNs proxy); collapse-id replacement on delete |
| File Storage | Vercel Blob (public + private) |
| Maps | MapLibre GL + MapTiler tiles + OSM Nominatim search |
| i18n | Custom trilingual system (AR/EN/UR), cookie-based SSR |
| Location | Capacitor Geolocation + browser fallback, polygon-based neighborhood detection (Balady) |
| PWA | Web App Manifest, standalone, RTL Arabic-first, offline fallback page |
| Logging | Structured console logger (`src/lib/logger.ts`) |
| Hosting | Vercel (production, preview deploys) |
| iOS CI | Codemagic → TestFlight → App Store Connect |
| Android CI | Local gradle (`./gradlew bundleRelease`) → Play Console |

---

## Mobile (Capacitor)

The web app is the source of truth. Capacitor wraps it as a native app — no parallel mobile codebase. The wrapper serves `https://app.hai-app.net` and falls back to a bundled `offline.html` on cold-start network failure.

| Native concern | How it's handled |
|---|---|
| Status bar / notch | Native launch storyboard "حي" → JS `<AppSplash>` hand-off, body background matches webview background (no seam) |
| Push | `@capacitor/push-notifications` (FCM + APNs); foreground forward via `notifyListeners`, native AppDelegate cleans delivered notifications when content is deleted |
| Geolocation | `@capacitor/geolocation` for neighborhood detect + ride pickup; web fallback for browsers |
| Camera / images | `@capacitor/camera` + `react-easy-crop` for upload + crop; HEIC accepted on iOS |
| Contacts | Custom `hai-contacts` Capacitor plugin (vendored under `plugins/hai-contacts`) for the "attach contact" sheet |
| Haptics | `@capacitor/haptics` (6 patterns) |
| Filesystem | `@capacitor/filesystem` for local cache |
| Browser | `@capacitor/browser` for external links (in-app webview, not Safari/Chrome) |
| Sharing | `@capacitor/share` for native share sheet |
| Splash | `@capacitor/splash-screen` (hidden immediately — JS `AppSplash` is the real splash) |

iOS-specific extras (`ios/App/App/`):
- `Info.plist` has `UIBackgroundModes: [remote-notification]` so silent pushes wake the app.
- `AppDelegate.swift` handles incoming pushes: forwards alerts to JS via `plugin.notifyListeners`, and natively removes delivered notifications when a `cleanup=true` push arrives — works even when JS is suspended (background).

---

## Project Structure

```
Hai - Project/
├── src/
│   ├── app/                                   # Next.js App Router
│   │   ├── layout.tsx                         # Root layout (theme, lang, providers, BottomNav, push reg)
│   │   ├── template.tsx                       # Route-transition wrapper
│   │   ├── page.tsx                           # Landing page
│   │   ├── error.tsx / global-error.tsx       # Error boundaries
│   │   ├── loading.tsx                        # Global loading
│   │   ├── globals.css                        # Tokens + dark mode + RTL helpers
│   │   │
│   │   ├── login / register / verify /        # Auth flow
│   │   │   onboarding / verify-location
│   │   ├── tutorial/                          # First-time slides
│   │   ├── feed/                              # Main neighborhood feed (FeedClient)
│   │   ├── market/                            # Marketplace (server-rendered)
│   │   ├── services/                          # Redirect → market?tab=SERVICES
│   │   ├── ask/                               # Quick-ask compose page
│   │   ├── post/new + post/[id]/pay           # Compose + boost
│   │   ├── threads/ + threads/[id]/           # DM list + chat
│   │   ├── rides/ + rides/new + rides/[id]/   # Rides surface (rides + delivery)
│   │   ├── notifications/                     # Bell tray
│   │   ├── profile/                           # Profile (accordion)
│   │   │   ├── edit / catalog /               # Sub-pages (all SSR'd)
│   │   │   │   change-neighborhood
│   │   ├── admin/                             # Admin dashboard (SSR'd overview)
│   │   ├── mod/                               # Neighborhood-mod dashboard (SSR'd)
│   │   ├── contests/                          # "Coming soon" (static)
│   │   ├── neighborhood-reports/              # Report to your nbhd admin
│   │   ├── support/                           # Support ticket to dev
│   │   ├── child-safety/                      # KSA / store compliance page
│   │   ├── privacy / terms /                  # Legal pages
│   │   ├── i/[code]/                          # Invite landing
│   │   └── api/                               # 123 API endpoints (see below)
│   │
│   ├── components/                            # Shared UI
│   │   ├── PostCard / PollCard / BottomNav
│   │   ├── EmergencyBanner / ArrivalAlert
│   │   ├── PushRegistration / CapacitorBridge
│   │   ├── ConfirmProvider / PullToRefresh / SwipeBack
│   │   ├── HighlightsSection / InviteLeaderboardCard
│   │   ├── ContactChip / LocationChip / SmartText
│   │   ├── AttachmentMenu / QuickAskSheet
│   │   ├── rides/  (LocationPicker, MapPicker, OfferCard, StatusBadge, Timeline)
│   │   └── …
│   │
│   ├── hooks/   useLanguage · useAutoRefresh · useGPSLocation · useRidePoll · useDragToDismiss · useBodyScrollLock · …
│   │
│   └── lib/
│       ├── i18n.ts                            # 600+ trilingual keys (AR/EN/UR)
│       ├── auth.ts                            # JWT (7-day) + session
│       ├── db.ts                              # Prisma client (Pg adapter)
│       ├── sms.ts                             # Twilio Verify
│       ├── apns.ts                            # Direct APNs HTTP/2 sender
│       ├── notifications.ts                   # In-app + push fan-out + cleanup
│       ├── pushMeta.ts                        # ContentRef + collapse-id helpers
│       ├── reputation.ts / reputation-levels.ts
│       ├── user-badge.ts / displayName.ts
│       ├── haptic.ts / sound.ts
│       ├── thread-rules.ts                    # DM eligibility
│       ├── validation.ts / profanityFilter.ts
│       ├── logger.ts / api-handler.ts / env-check.ts
│       ├── safe-fetch.ts / network.ts         # Offline-aware fetch + banner
│       ├── arrival-alert.ts                   # Sound + vibration for rides
│       ├── blocks.ts                          # Bidirectional user blocks
│       ├── capabilities.ts / usage.ts         # Plan limits + tracking
│       ├── mod-safety.ts / mod-allocation.ts
│       ├── seed-service.ts                    # Auto-seed sample content
│       ├── adminDashboard.ts                  # Shared admin overview query (page + API)
│       ├── highlights.ts                      # Feed highlights bundle
│       ├── postExpiry.ts                      # Auto-archive rules
│       ├── posts/classify.ts                  # Category classifier (v2)
│       ├── location/                          # Polygon detect + sample picking
│       └── rides/                             # State machine + pricing + events
│
├── plugins/hai-contacts/                      # Custom Capacitor plugin (vendored)
├── ios/App/                                   # Xcode project (Codemagic builds this)
├── android/                                   # Android Studio project (local gradle)
├── capacitor.config.ts                        # Capacitor wrapper config
├── codemagic.yaml                             # iOS-only CI to TestFlight
├── prisma/
│   ├── schema.prisma                          # 54 database models
│   ├── migrations/                            # Manual — Vercel build does NOT migrate
│   └── seed.ts
├── scripts/                                   # Mockups, fonts, screenshots, seeders
└── public/                                    # PWA assets, icons, screenshots, store screenshots
```

---

## API Endpoints (123 total)

### Authentication (4)
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/auth/send-otp` | Send OTP via Twilio Verify (Saudi-phone validation, rate-limited) |
| POST | `/api/auth/verify-otp` | Verify OTP, mint 7-day JWT cookie |
| POST | `/api/auth/complete-profile` | Set name, gender, accountType, neighborhood (GPS-matched) |
| POST | `/api/auth/logout` | Clear session cookie |

### Posts & Feed (10)
| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/posts` | Paginated feed (20/page, scored) / create post |
| GET/PUT/DELETE | `/api/posts/[id]` | Single post CRUD |
| POST | `/api/posts/[id]/activate` | Activate paid/boost |
| POST | `/api/posts/[id]/react` | Add/remove emoji reaction |
| GET/POST | `/api/posts/[id]/comments` | Threaded comments |
| DELETE | `/api/posts/[id]/comments/[commentId]` | Delete comment (with OS push cleanup) |
| POST | `/api/posts/[id]/bookmark` | Toggle bookmark |
| POST | `/api/posts/[id]/subscribe` | Toggle post-subscription (notify on new comments) |
| PATCH | `/api/posts/[id]/category` | Admin re-categorize |
| GET | `/api/feed` | Scored feed (dedup + commercial balance + request-boost) |
| POST | `/api/posts/report` | Report a post |

### Comments (1)
| POST `/api/comments/[id]/like` | Toggle like (+rep, anti-gaming applied) |

### Polls & Voting (5)
| GET/POST `/api/polls` · GET/PUT/DELETE `/api/polls/[id]` · POST `/api/polls/[id]/vote` · POST `/api/polls/[id]/react` · GET/POST `/api/polls/[id]/comments` |

### Rides + Delivery (12)
RideRequest rows carry `type: 'RIDE' | 'DELIVERY'` so delivery and rideshare share the same surface.

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/rides` | List (filter by `type`) / create |
| GET/PUT | `/api/rides/[id]` | Get / update |
| GET | `/api/rides/mine` | My requests + offers |
| GET/POST | `/api/rides/[id]/offers` | List / submit offer |
| POST | `/api/rides/[id]/select` | Requester picks an offer |
| POST | `/api/rides/[id]/reject-offer` | Requester rejects an offer |
| POST | `/api/rides/[id]/confirm` | Confirm arrival / pickup / dropoff |
| POST | `/api/rides/[id]/messages` | In-ride chat |
| POST | `/api/rides/[id]/status` | Cancel / dispute / status transitions |
| POST | `/api/rides/[id]/rate` | Rate driver or requester |
| GET/POST | `/api/rides/[id]/poll` | Inline status poll + timeout handling |

### Threads / DMs (8)
| GET/POST `/api/threads` · GET/POST `/api/threads/[id]/messages` · DELETE/PATCH `/api/threads/[id]/messages/[msgId]` (delete for me / everyone, edit) · POST `/api/threads/[id]/messages/[msgId]/react` · POST `/api/threads/[id]/messages/[msgId]/report` · POST `/api/threads/[id]/close` · POST `/api/threads/[id]/rate` |

### Notifications (8) — In-app + Push
| GET/POST/DELETE `/api/notifications` · POST `/api/notifications/read` · POST `/api/notifications/delete` · GET `/api/notifications/unread` · GET `/api/notifications/active-refs` · GET/PATCH `/api/notifications/preferences` · GET/PATCH `/api/notifications/preset` · GET/PATCH `/api/notifications/quiet-hours` · PATCH `/api/notifications/settings` (legacy) |

### Push Devices (1)
| POST `/api/devices/register` | Register/refresh FCM or APNs token |

### Emergency Alerts (6)
| GET `/api/emergency/active` · POST `/api/emergency/create` (mod) · POST `/api/emergency/[id]/dismiss` · POST `/api/emergency/[id]/revoke` · POST `/api/emergency/request` (resident → mod) · GET `/api/emergency/requests/mine` |

### Invites (6)
| GET `/api/invites/my-code` · GET `/api/invites/preview` · POST `/api/invites/redeem` · GET `/api/invites/leaderboard` · GET `/api/invites/chain` |

### Profile & Account (12)
| GET/PATCH `/api/profile` · PATCH `/api/profile/language` · POST `/api/profile/change-neighborhood` · POST `/api/profile/change-phone` · POST `/api/profile/send-email-verify` · POST `/api/profile/verify-email` · POST `/api/profile/verify-provider` · POST `/api/profile/verify-address` · GET `/api/profile/reputation` · GET `/api/profile/rep-check` · DELETE `/api/account/delete` (+ `/send-otp`) · GET `/api/legal` |

### Provider (1)
| POST `/api/provider/apply` |

### Service Catalog (2)
| GET/POST/PATCH/DELETE `/api/service-items` · GET `/api/service-items/mine` |

### Bookmarks (1)
| GET/POST `/api/bookmarks` |

### Users (5)
| GET `/api/users/[id]/profile` · GET `/api/users/[id]/status` · POST `/api/users/[id]/report` · POST/DELETE/GET `/api/users/block` · PATCH `/api/users/privacy` |

### Geographic (3)
| POST `/api/neighborhoods/detect` · GET `/api/neighborhoods/all` · GET `/api/cities` |

### Community & Support (4)
| GET/POST `/api/mod-request` · POST `/api/neighborhood-report` · POST `/api/neighborhood-admin` · POST `/api/support` |

### Admin (15)
| GET `/api/admin/dashboard` · POST `/api/admin/action` · GET `/api/admin/lists` · POST `/api/admin/moderate` · POST `/api/admin/escalate` · GET/POST `/api/admin/neighborhood-requests` · POST `/api/admin/seed` (+ `/clear` `/generate` `/stats`) · GET `/api/admin/mods` + `/api/admin/mods/[id]` · POST `/api/admin/user-reports/[id]` · POST `/api/admin/emergency-requests/[id]/approve` + `/reject` · GET `/api/admin/debug-location` |

### Cron (7)
| `/api/cron/rides` (timeouts) · `/api/cron/process-notifs` (batch push) · `/api/cron/archive-posts` · `/api/cron/close-idle-threads` · `/api/cron/expire-alerts` · `/api/cron/mod-lifecycle` · `/api/cron/reward-invites` · `/api/cron/weekly-digest` |

### Debug / Internal (5)
| `/api/debug/whoami` · `/api/debug/push-status` · `/api/debug/push-test` · `/api/debug/fcm-check` · `/api/debug/revoke-notifs` (notification-cleanup self-test for SUPER_ADMIN) · `/api/ping` (offline-page liveness) |

### Utilities (2)
| POST `/api/upload` (Vercel Blob, magic-byte validated) · POST `/api/translate` |

### Highlights (1)
| GET `/api/highlights` |

---

## Database Models (54)

### User & Auth
- **User** — phone, name, lastName, gender, avatar/coverUrl, reputation, role, status, accountType, providerStatus, plan, neighborhoodId, addressVerified, bio, service\*, modStatus, modActionsCount, modReportCount, lastModActionAt, driverRatingAvg, driverTripsCount, driverCancelCount, **language** (`ar`/`en`/`ur`, used by push localization), showReadReceipts, showGender, deletedAt, isSeed, …
- **OtpCode** — phone-scoped Twilio Verify codes

### Geographic
- **City** · **Neighborhood** (Balady polygon + bbox, source: balady/community) · **Compound** (APARTMENT / VILLA_COMPOUND / MIXED)

### Posts (with `PostCategory` v2)
- **Post** — title, body, **category** (v2 enum, see below), **intent** (OFFER / REQUEST / NORMAL), **priority** (LOW / NORMAL / HIGH / CRITICAL), **audience** (ALL / WOMEN / MEN), **marketplaceType** (SELL / BUY / JOB, MARKETPLACE-only), status (PENDING_AI / ACTIVE / IN_PROGRESS / HIDDEN / REMOVED / EXPIRED / ARCHIVED), price, imageUrls, isPaid, isPinned, isFeatured, isHighlighted, coordinationMode, reportCount, expiresAt, editedAt, activeThreadId
- **Comment** (threaded, with `parentId`) · **CommentLike** · **Reaction** · **Bookmark** · **PostSubscription** · **Report** · **UserReport** (account-level user reports with reporter/reportedUser scoping for mods)

### Polls
- **Poll** · **PollVote** · **PollComment** · **PollReaction**

### Rides + Delivery
- **RideRequest** — pickup/dropoff GPS + address + area, `status` (11-state enum), `type: 'RIDE' | 'DELIVERY'`, `itemDescription` (delivery only), `isImmediate`, `scheduledAt`, `notes`, `estimatedMinPrice`/`estimatedMaxPrice`, `expiresAt`
- **RideOffer** (status enum) · **Trip** · **RideRating** · **RideDispute** · **RideEvent** (audit) · **RideMessage**

### Threads
- **Thread** (user1, user2, postId, status OPEN/CLOSED/ARCHIVED, coordinationMode) · **Message** (TEXT / LOCATION / IMAGE / CONTACT, with `deliveredAt`/`readAt`, `hiddenBy` for delete-for-me)

### Notifications + Push
- **Notification** (in-app bell row) · **DeviceToken** (platform: ios/android/web, FCM or APNs token + status) · **NotifPreference** (per-type fan-out toggles) · **NotifJob** (durable retry queue for batched pushes) · **NotificationPreference** (legacy) · **DigestLog** (weekly digest dedup)

### Reputation & Moderation
- **ReputationLog** (rep deltas, anti-gaming) · **ModerationLog** (admin action audit) · **ModActionLog** (per-mod rate-limit + history) · **ModRequest** · **VerificationRequest** · **NeighborhoodReport** · **SupportTicket**

### Emergency Alerts
- **EmergencyAlert** (mod-issued, severity, expiresAt) · **EmergencyAlertDismissal** (per-user dismiss) · **EmergencyAlertRequest** (resident → mod request to escalate)

### Invites
- **InviteCode** (per-user, capped redemptions) · **InviteRedemption** · **InviteFraudSignal**

### Neighborhood Management
- **NeighborhoodChangeRequest** · **NeighborhoodChangeLog**

### Service Providers + Catalog
- **ServiceItem** (per-provider catalog row, image + price + sortOrder + active)

### Safety
- **UserBlock** (bidirectional pair)

### Monetization (internal-only)
- **UsageCounter** · **PlanChangeLog** · **Payment** (Moyasar IDs reserved)

### B2B (Compounds — early)
- **Announcement** · **MaintenanceRequest**

---

## Post Categories (v2)

The v2 system splits the old single `PostCategory` into three orthogonal dimensions: `category` (what kind of content), `intent` (offering vs requesting), and `audience` (who it's for). The feed UI shows category chips plus a special "REQUESTS" chip that selects by intent across all categories.

### `PostCategory` (10 values)

| Key | Arabic | English | Notes |
|-----|--------|---------|-------|
| HOME_BUSINESSES | الأسر المنتجة | Home Businesses | (was `FOOD_HOME`) |
| MARKETPLACE | سوق الحي | Marketplace | Uses `marketplaceType` (SELL/BUY/JOB) |
| SERVICES | خدمات | Services | |
| RIDES | مشاوير | Rides | (was `RIDE_REQUEST` + intent=REQUEST) |
| REAL_ESTATE | عقارات | Real Estate | |
| LOST_FOUND | مفقودات | Lost & Found | priority=HIGH |
| NEIGHBORHOOD_REPORTS | بلاغات الحي | Neighborhood Reports | absorbs old `ALERT` + `NEIGHBORHOOD_ISSUE`, priority=HIGH |
| EVENTS | فعاليات ومناسبات | Events & Occasions | absorbs old `MOSQUE` + `EID_RAMADAN` |
| COMPETITIONS | مسابقات وجوائز | Contests & Prizes | (was `CONTESTS`) admin-create only |
| GENERAL | عام | General | hidden admin fallback |

### `PostIntent` (3)
`OFFER` (default for sell-side categories), `REQUEST` (the user is asking — "أبحث عن…"), `NORMAL` (informational).

### `PostAudience` (3)
`ALL`, `WOMEN` (was `WOMEN_ONLY` category — now an axis), `MEN`. Male viewers don't see `WOMEN` posts.

### `PostPriority` (4)
`LOW`, `NORMAL`, `HIGH` (LOST_FOUND, NEIGHBORHOOD_REPORTS), `CRITICAL` (emergency-class, bypasses category filters).

### `MarketplaceType` (3, MARKETPLACE-only)
`SELL` (default), `BUY`, `JOB`.

---

## Rides + Delivery (Community Coordination)

### State Machine (11 states)
```
RIDE_OPEN → RIDE_SELECTED → RIDE_CONFIRMED → RIDE_EN_ROUTE →
RIDE_ARRIVED → RIDE_IN_PROGRESS → RIDE_PENDING_COMPLETION → RIDE_COMPLETED
                                                          ↗
Side states: RIDE_CANCELLED · RIDE_EXPIRED · RIDE_DISPUTED
```

### Type Split
RideRequest carries `type: 'RIDE' | 'DELIVERY'`. The rides dashboard has a sub-filter under the "all" tab so the two surfaces don't mix. Delivery rows additionally carry `itemDescription`.

### Flow
1. Requester creates request (pickup GPS + dropoff search/map). Delivery adds an item description.
2. Drivers see open requests, submit offers (arrival ETA + optional message + counter-price).
3. Requester selects an offer → both notified (push + in-app).
4. Driver confirms en-route → external maps deep link to pickup.
5. Driver arrives → requester notified.
6. Driver starts trip → external maps deep link to dropoff.
7. Requester confirms completion (or auto-completes after timeout).
8. Both rate each other; rep deltas applied.

### Key Features
- **Cross-list in feed**: open DELIVERY requests surface in the REQUESTS / RIDES / ALL feed chips as a slim strip (tap → `/rides/[id]`).
- **In-ride chat** anchored at bottom, dark-mode trip UI.
- **Inline timeout handling** via poll endpoint (no external cron required for short timers; longer ones use `/api/cron/rides`).
- **Cancel penalties** after agreement stage (-15 rep).
- **Dispute system** with admin resolution.
- **Global ArrivalAlert overlay** — sound + vibration + full-screen card when the driver arrives or an offer is accepted, works from any page.

### Location Picker
- GPS auto-detect (Capacitor on native, browser on web).
- MapTiler tiles + Nominatim search.
- Fullscreen map picker uses `data-overlay="true"` so PullToRefresh doesn't fire on map drag.

---

## User Roles

| Role | Scope | Can Do |
|------|-------|--------|
| RESIDENT | Own neighborhood | Post, comment, react, report, DM, ride/delivery, bookmark, subscribe |
| NEIGHBORHOOD_MOD | Assigned neighborhood | + hide/restore posts, temp-ban users, issue emergency alerts |
| COMPOUND_ADMIN | Assigned compound | Manage compound announcements & maintenance |
| PLATFORM_MOD | All neighborhoods | + remove posts, global ban |
| SUPER_ADMIN | Entire platform | + role changes, plan changes, delete users, approve mods, create polls, view debug diagnostics |

**Becoming a mod**: 7+ day account, 20+ reputation. Apply via profile. Auto-approval if neighborhood has 0 mods and applicant has 50+ rep + 14+ day account.

---

## Reputation System

### Tiers

| Tier | Points | Pill | Daily Posts | Report Weight | Feed Boost | Rating Weight |
|------|--------|------|-------------|---------------|------------|---------------|
| New (جديد) | 0-49 | gray | 3 | 1.0× | 0 | 1.0× |
| Active (نشط) | 50-149 | blue | 5 | 1.0× | 1.2 | 1.0× |
| Trusted (موثوق) | 150-399 | green | 8 | 1.2× | 1.5 | 1.1× |
| Distinguished (مميز) | 400+ | amber | 12 | 1.4× | 1.8 | 1.2× |

### Point Awards (rebalanced)

| Action | Δ | Notes |
|--------|---|-------|
| Ride/Delivery completed | +12 | Real trust signal |
| Service completed (via thread close) | +10 | |
| Positive rating | +6 | Weighted by rater rep |
| Comment liked | +1 | Minor |
| Reaction received | 0 | Removed — too easy to farm |
| Report confirmed against you | -20 | Auto-hide |
| Spam detected | -30 | Duplicate content |
| Negative rating | -10 | Weighted |
| Ride cancel after agreement | -15 | |

### Anti-gaming
Pair cap (2/day per pair), daily total cap (12), diminishing returns (3 full → 3 half → 0), new-user 0.5× weight, report threshold weighted (4.0).

---

## Badges & Identity

**Inline with name** (identity): blue ✓ (VERIFIED_PROVIDER), 🛠 (SERVICE_PROVIDER), 🏅 (NEIGHBORHOOD_MOD), 👑 (SUPER_ADMIN).

**Below name** (tier pill): gray/blue/green/amber per reputation tier.

**Boosted content**: subtle "**بارز** / Featured" pill next to timestamp on boosted/featured posts. Distinct from the reputation "مميز" tier.

---

## Threads / DMs

### Eligible categories
SERVICES, MARKETPLACE, RIDES (replaces old RIDE_REQUEST), REAL_ESTATE, HOME_BUSINESSES, plus any post with `intent=REQUEST`.

### Coordination modes
- **OPEN** — multiple parallel threads (marketplace, services, home_businesses)
- **EXCLUSIVE** — single active thread (rides — first-come, first-served)

### Lifecycle
DM → exchange (TEXT / LOCATION / IMAGE / CONTACT) → close → rating → rep delta.

### Recent features
- WhatsApp-style sent/delivered/read check marks in the threads list + chat.
- Per-message react & report.
- Edit / delete-for-me / delete-for-everyone (with OS-level push notification cleanup on both devices).
- Glass UI chat surface with dark-mode parity.
- Contact + Location attachment chips (custom Capacitor plugin for native contacts).
- Profanity filter applied on send.
- Read-receipt opt-out (`User.showReadReceipts`).

---

## Polls / Voting

- Admin-only creation (SUPER_ADMIN, NEIGHBORHOOD_MOD).
- Animated percentage bars, real-time vote tracking.
- Emoji reactions on polls.
- Inline comments with author delete.
- Polls render in the feed alongside posts.

---

## Feed & Real-Time Updates

### Scoring (server-side, cached 60s per `neighborhood:category:gender` combo)
```
score = (50 + engagement + typeBoost + intentBoost(REQUEST) + repBoost) / (hoursAgo + 2)
```
Pinned/featured get score `999999`/`999998`. Anti-domination caps consecutive same-author posts at 2. Commercial-balance caps MARKETPLACE/HOME_BUSINESSES/REAL_ESTATE/SERVICES at ~30% of the visible window.

### REQUEST visibility experiment (`NEXT_PUBLIC_REQUEST_BOOST`)
- +10 score bump on `intent=REQUEST` posts.
- Soft guarantee: if the first 5 feed slots have no REQUEST, splice the top-ranked one into position 4 (with cookie dedup to prevent loops).
- "Recent activity" dot on the REQUESTS chip when any REQUEST is < 6 hours old.

### SSR-first
Every page that renders content fetches it server-side in the App Router server component and passes initial data to a thin client component. No `useEffect` → fetch → setState pattern; content is on screen from first paint. The 30s background refresh keeps things current silently.

### Cross-list strips
- Open DELIVERY ride requests (top 3) shown in the REQUESTS / RIDES / ALL chips.
- Active polls.
- Emergency alerts banner (mod-issued, severity-coloured).
- Invite leaderboard card (when ≥2 inviters exist in the neighborhood).

---

## Notifications

### In-app (bell tray)
- SSR'd notification list, 50 most recent.
- Marked read on open.
- DMs no longer mirrored into the bell (thread list is the canonical surface).
- Per-user preferences: presets (URGENT_ONLY / BALANCED / EVERYTHING / MANUAL) + quiet hours + per-type toggles.

### Push (mobile)
Full chain: **FCM v1** for Android + **direct APNs HTTP/2** for iOS (no Firebase APNs proxy). Tokens registered via `/api/devices/register` on app start, deduped by token.

| Capability | How it works |
|---|---|
| Batched sending | `/api/cron/process-notifs` drains `NotifJob` rows every minute; kick endpoint triggers immediate send on hot path |
| Per-instance collapse-id | `post:<id>` / `comment:<id>` / `message:<id>` / `rideRequest:<id>` — replaces banner cleanly instead of stacking |
| Localized copy | `User.language` joined on token lookup; per-recipient AR/EN/UR copy |
| Cleanup on delete | When a user deletes their content, a cleanup alert push with the same collapse-id arrives ("🗑️ deleted a message") and replaces the original banner; iOS AppDelegate also natively removes delivered notifications via `removeDeliveredNotifications(withIdentifiers:)` |
| Foreground forwarding | iOS AppDelegate calls `plugin.notifyListeners("pushNotificationReceived")` so the JS bridge sees pushes even when the app is foregrounded |
| Diagnostics | `/api/debug/revoke-notifs` self-test endpoint + a SUPER_ADMIN diagnostic panel in profile (List / Send alert / Send cleanup / Sweep / Self-test) |

### Global overlays
- **Emergency banner** (high/medium severity, pulse animation).
- **ArrivalAlert** — full-screen sound + vibration overlay for ride status changes.

---

## Emergency Alerts

Mod-issued alerts that pop on top of the feed for everyone in the neighborhood.
- Severities: critical (red pulse) / warning (amber pulse) / info.
- Per-user dismiss.
- `EmergencyAlertRequest` lets residents request the mod issue an alert; mod approves/rejects.
- Auto-expires (`expiresAt`) via `/api/cron/expire-alerts`.

---

## Invites & Growth

- Each user gets a unique invite code (`InviteCode`).
- Sharing surface in profile + landing page; redemption at `/i/[code]`.
- Per-neighborhood + global leaderboards (`InviteLeaderboardCard` in feed when ≥2 inviters).
- Anti-fraud: `InviteFraudSignal` rows flag suspicious chains.
- Rewards processed by `/api/cron/reward-invites`.

---

## Profile Page (Accordion)

**Always visible**
- Header (cover + avatar + name + badge + neighborhood + tier pill).
- Stats (reputation, posts, join year).

**Quick links**
- Mod Dashboard (mods only).
- Service Catalog (providers only).

**Collapsible (one open at a time)**
1. Reputation — tier progress + recent activity + tips.
2. Bio / About — service description + map (providers).
3. Account — name, phone (with OTP change), email (with verification), neighborhood (GPS-only change, capped per month).
4. Settings — language (AR/EN/UR — also PATCHes `User.language` for push), theme (light/dark/system), privacy (showReadReceipts, showGender).
5. Notifications — presets + per-type toggles + quiet hours.
6. Help & More — mod request, terms/privacy, restart tour, neighborhood reports, app support, child-safety.

**Bottom**
- Admin Control Panel (admin roles).
- Logout.
- Delete Account (App Store / Play compliance — soft delete + anonymize).
- SUPER_ADMIN-only: push-notification diagnostic panel.

---

## Onboarding Tour (5 Flows)

| Flow | Steps | Trigger |
|---|---|---|
| Global | 3 (welcome, create, interact) | First feed visit |
| Ride Create | 3 (pickup, dropoff, submit) | `/rides/new` |
| Ride Detail | 3 (offers, select, status) | `/rides/[id]` |
| Post Create | 3 (category, content, images) | `/post/new` |
| Chat | 3 (messages, location, close) | `/threads/[id]` |

SVG mask overlay, smart tooltip positioning, retry-up-to-2.5s before skipping a missing target, localStorage per flow, all reset on new-account creation, restartable from profile.

---

## Splash + Landing + Tutorial

- **Splash** — native launch storyboard → JS `<AppSplash>` zoom-fade dismiss, once per install.
- **Landing** — rotating taglines (5/lang, 2s cycle), trilingual switcher, "اعرف جيرانك" copy.
- **Tutorial** — 4-slide first-run flow (feed, ride, chat, profile) using the same phone mockups as the website + App Store screenshots.

---

## Notification System (in-app side, swipe gestures)

- Swipe-to-delete with 3-phase animation + haptic.
- RTL-aware swipe direction.
- Unread badges on bottom-nav (messages count separate from other notifs).
- 7 controls in 4 groups: Posts · Messages · Rides · Neighborhood/System.

---

## Support & Reports

| Channel | Audience | UI |
|---|---|---|
| Neighborhood Reports | Residents → their nbhd mod | `/neighborhood-reports` |
| Support Tickets | All users → SUPER_ADMIN | `/support` |
| Mod Requests | Residents → SUPER_ADMIN | Profile → Help & More |
| User Reports | Any user → mods | "Report user" sheet on profile / chat |
| Emergency Request | Resident → nbhd mod | `EmergencyRequestSheet` |

---

## Mod System

### Permissions
- Auto-approval: 0 active mods in nbhd + 50+ rep + 14+ day account.
- Dynamic capacity by activity (LOW: 1, MEDIUM: 2–3, HIGH: 3–5).
- Feed banner "حيّك يحتاج مشرف" when nbhd has none (3-show cap, dismissable).

### Safety
- 48h probation — no permanent ban, no remove_post.
- NEIGHBORHOOD_MOD never bans / removes / deletes globally.
- Rate limit: 15 actions/hour.
- Conflict of interest blocks: own post, recent chat, prior comment, competitor, prior report on same post.
- Escalation channel to PLATFORM_MOD/SUPER_ADMIN (max 5/hour, no dupes).
- `ModActionLog` audit + `modStatus` lifecycle (ACTIVE / UNDER_REVIEW / INACTIVE / SUSPENDED), surfaced on the admin dashboard's "mod-health" panel.

---

## Haptic Feedback (6 patterns)
Light (10ms) · Medium (25ms) · Heavy (50ms) · Success · Error · Warning. Capacitor Haptics on native, Vibration API fallback on web.

---

## Neighborhood Detection

1. Capacitor / browser geolocation collects multiple samples.
2. Best sample picked by accuracy + confidence.
3. Point-in-polygon ray-cast against Balady boundary polygons.
4. Returns neighborhood + confidence (HIGH / MEDIUM / LOW).
5. Fallback: manual selection sorted by distance.

Source: Balady government API (`umaps.balady.gov.sa`) + a few community-defined polygons for missing districts.

---

## Internationalization

- 600+ trilingual keys in `src/lib/i18n.ts`.
- AR (primary), EN, UR.
- Cookie + `User.language` column. Cookie is the SSR-time source; the column is what the push pipeline joins for localized notification copy.
- `LangProvider` context, server-applied `html lang` / `dir` for no-flash.
- RTL for AR/UR, LTR for EN.

---

## Dark Mode

- Class-based (`dark:` Tailwind).
- Three options: Light / Dark / System.
- Cookie-primary (`hai_theme`) + localStorage fallback.
- Inline head script applies the class before paint to avoid theme-flash.
- iOS WKWebView meta-color-scheme synced so the keyboard appearance matches.

---

## Security

### Auth
- Twilio Verify for OTP (KSA-scoped phone validation).
- JWT 7-day, httpOnly, Secure, SameSite=Lax cookie.
- Rate limit: 3 OTPs/10min, 5/hour per phone.
- Brute-force: 5 failures → 15-min lockout.

### Content
- Validation (length, real-text heuristic, repetition).
- Profanity filter (`src/lib/profanityFilter.ts`).
- Magic-byte image validation (JPEG/PNG/WebP/HEIC).
- Duplicate post detect (3-hour window).
- Post cooldown (60s).
- Upload rate limit (10 files/min).

### Admin / Mod
- Role hierarchy enforced — mods can't affect higher roles, SUPER_ADMIN immutable.
- All admin actions in `ModerationLog`.
- Neighborhood mods scoped to their nbhd.
- `getActorRole()` checks participant role before admin role to prevent 409s.

### Capacitor
- `cleartext: false` everywhere — HTTPS only.
- `allowMixedContent: false` on Android.
- Custom user-agent `HaiNativeApp` so the server can tell native from web.

---

## Service Provider Catalog

- Up to 3 items on FREE / 20 on PREMIUM.
- Title, description, price, photo.
- 2-column grid in profile popup.
- Tap → bottom sheet → "تواصل لطلب الخدمة" → opens thread.
- Managed at `/profile/catalog` (SSR'd).

---

## User Safety & Compliance

| Item | Status |
|---|---|
| Report posts | ✅ Auto-moderation, rep-weighted threshold |
| Report users | ✅ Account-level (`UserReport`, mod-scoped) |
| Block users | ✅ Bidirectional filter (feed, threads, thread creation) |
| Account deletion | ✅ Self-service soft delete + anonymize + OTP-gated |
| Privacy policy | ✅ `/privacy` (trilingual) |
| Terms of service | ✅ `/terms` (trilingual) |
| Child safety | ✅ `/child-safety` (trilingual, App Store / KSA-compliant disclosure) |
| Legal endpoint | ✅ `GET /api/legal` |
| Rate limiting | ✅ Posts, reports, uploads, mod actions, OTP, ride offers |
| Content validation | ✅ Length, real text, duplicate, profanity |
| Image validation | ✅ Magic-byte (JPEG/PNG/WebP/HEIC) |
| Gender selection | ✅ Male / Female / Prefer not to say |

---

## Monetization (foundation, internal-only — no upsell UI yet)

| Component | Description |
|---|---|
| `user.plan` | FREE (default) / PREMIUM — never shown in UI |
| `capabilities.ts` | Centralized limits + entitlements |
| `UsageCounter` | Per-user / per-feature / per-window |
| `PlanChangeLog` | Audit trail |
| Limit messages | Neutral: "وصلت الحد الأقصى" — never "upgrade" |
| Admin action | `change_plan` with audit |

### FREE vs PREMIUM
| Feature | FREE | PREMIUM |
|---------|------|---------|
| Posts/day | 3 | 10 |
| Ride offers/day | 3 | 20 |
| Catalog items | 3 | 20 |
| Threads/day | 6 | 50 |
| Uploads/day | 7 | 30 |
| Feed boost | 1.0× | 1.3× |
| Featured listings | No | Yes |
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
  "theme_color": "#006d57",
  "categories": ["social", "lifestyle"]
}
```

Offline fallback page (`public/offline.html`) — Capacitor `errorPath` serves it on cold-start network failure; the page polls `/api/ping` and reloads when connectivity returns.

---

## Environment Variables

```env
# DB
DATABASE_URL=postgresql://...@aws-...pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://...@aws-...pooler.supabase.com:5432/postgres

# Auth
JWT_SECRET=<secure-random-string>

# Twilio Verify
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_VERIFY_SERVICE_SID=...

# Push — APNs (direct HTTP/2)
APNS_KEY_ID=...
APNS_TEAM_ID=...
APNS_BUNDLE_ID=com.hai.app
APNS_PRIVATE_KEY=<base64 .p8 contents>

# Push — FCM v1
FCM_PROJECT_ID=...
FCM_SERVICE_ACCOUNT=<base64 service-account.json>

# Storage
BLOB_READ_WRITE_TOKEN=...

# Hosting
NEXT_PUBLIC_BASE_URL=https://app.hai-app.net

# Experiments
NEXT_PUBLIC_REQUEST_BOOST=1     # set to 0 to disable the request-boost set
```

---

## Scripts

```bash
npm run dev              # Next.js dev server (port 3001)
npm run build            # Production build (prisma generate && next build)
npm run start            # Production server
npm run lint             # ESLint

npx prisma migrate dev   # Schema change → migration
npx prisma studio        # Visual DB explorer

# Capacitor
npx cap sync ios         # Push web assets to iOS project
npx cap sync android     # Push web assets to Android project
npx cap open ios         # Open Xcode
npx cap open android     # Open Android Studio

# Android AAB (local — Codemagic is iOS-only)
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
cd android && ./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab

# iOS release: pushed via Codemagic (codemagic.yaml) → TestFlight → App Store

# Mockups + screenshots
node scripts/mockup-screenshots.mjs           # 4 website phone mockups (dark + light)
node scripts/style-screenshots.mjs            # Play Store branded marketing screenshots
node scripts/store-screenshots-tutorial.mjs   # App Store (1284×2778) + Play (1080×1920) frames
node scripts/generate-feature-graphic.mjs     # Play Store feature graphic
node scripts/generate-icons.mjs               # All icon sizes
```

---

## Dependencies (key)

### Production
- `next@14.2.4` · `react@18`
- `@prisma/client@7.5` · `@prisma/adapter-pg` · `pg@8`
- `jose@5.6` (JWT) · `bcryptjs`
- `@vercel/blob` — image storage
- `maplibre-gl` — map rendering
- `react-easy-crop` — image crop UI
- `nodemailer` — email verification
- `react-hot-toast` · `react-icons` · `@emoji-mart/react` + `@emoji-mart/data`
- `@capacitor/core@8` + plugins: `android`, `ios`, `cli`, `app`, `browser`, `camera`, `filesystem`, `geolocation`, `haptics`, `keyboard`, `push-notifications`, `share`, `splash-screen`, `status-bar`
- `@capacitor-community/contacts@7` · `hai-contacts` (vendored, custom)
- `next-pwa@5.6`

### Dev
- `typescript@5` · `tailwindcss@3.4`
- `prisma@7.5` · `tsx@4`
- `sharp@0.34` (image processing for screenshot pipelines)
- `opentype.js` (font helpers for marketing scripts)
- `patch-package` (vendor patches for native plugins)

---

## Deployment Pipeline

| Surface | Path |
|---|---|
| Web app | `git push main` → Vercel auto-deploys |
| iOS | Codemagic detects push → builds IPA → uploads to TestFlight → manual promote to App Store Connect |
| Android AAB | Bump `versionCode` in `android/app/build.gradle` → local `./gradlew bundleRelease` → upload to Play Console |
| DB migrations | **Manual** — Vercel build does NOT run `prisma migrate deploy`. Apply migrations directly to Supabase via SQL editor or `npx prisma migrate deploy` from a machine with valid creds, then `prisma migrate resolve --applied <name>` if you used the SQL editor. Prefer explicit `select` over `include` in server components so a schema-ahead-of-DB state degrades to a smaller query instead of 500-ing |

---

## Architecture Decisions Worth Knowing

- **Capacitor wraps the live web app, not a static bundle** — `server.url` points at `https://app.hai-app.net`. The `webDir` is only used for the offline-fallback page. One codebase, no separate mobile build pipeline beyond the platform shells.
- **Push is direct, not through Firebase APNs** — `src/lib/apns.ts` opens its own HTTP/2 connection. This avoids the silent-throttle and stale-delivery issues with the Firebase APNs proxy, at the cost of managing the .p8 cert ourselves.
- **Cleanup-via-collapse-id, not silent push** — when a user deletes content, we send a regular *alert* push with the same `apns-collapse-id` / FCM `tag`, plus a `cleanup: 'true'` data field. iOS replaces the banner; the AppDelegate also natively removes delivered notifications. This sidesteps Apple's silent-push throttling.
- **SSR-first** — pages fetch their data in the server component and pass it to client components as initial props. No `useEffect` → fetch → setState patterns. Background polling stays for freshness, but content is there on first paint.
- **Manual Prisma migrations** — Vercel build runs `prisma generate && next build`, not `migrate deploy`. Migrations get applied to Supabase by hand. Use explicit `select` so missing columns don't 500 the page.
- **Trilingual at the schema layer** — `User.language` is joined on push-token lookups so each recipient sees a banner in their own language without round-tripping through the client.

---

## License

Private — All rights reserved.

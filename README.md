<div align="center">

# حي · Hai

**A neighbourhood social platform: organised by district, driven by reputation, in Arabic, English and Urdu.**

![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)
![Capacitor](https://img.shields.io/badge/Capacitor-8-119EFF?logo=capacitor&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white)

</div>

---

## About

Hai (حي, "neighbourhood") is a community platform for residents of the same district in Saudi Arabia, built as an organised alternative to busy WhatsApp groups. Each user belongs to a neighbourhood, detected from GPS against official boundary polygons, and sees a feed, marketplace, services, polls and ride requests scoped to that neighbourhood. Moderation and reputation keep it trustworthy.

One Next.js codebase serves the web app and the API. Capacitor wraps it as native **Android** and **iOS** apps.

## ✨ Features

- **Neighbourhood feed**: categorised posts (alerts, neighbourhood issues, lost & found, "looking for", buy/sell, home food, real estate, services, mosque announcements, events) with reactions, threaded comments and a scored, de-duplicated ranking.
- **Marketplace & services**: listings, a provider catalogue, social links and a place directory with reviews.
- **Community rides**: neighbours post a trip, drivers send offers, the requester picks one, and an in-ride chat and status timeline follow the trip through to ratings on both sides.
- **Direct messages**: one-to-one threads linked to posts, with text, location, images, PDFs and voice notes.
- **Polls & poll requests**: moderators create polls, and residents can request them.
- **Emergency alerts**: moderators can broadcast time-limited neighbourhood alerts with a severity level.
- **Neighbourhood membership**: verified resident, claimed resident (pending verification) and outside visitor, each with its own permissions. Moderators review residency claims.
- **Reputation & badges**: tiered reputation with anti-gaming rules (daily caps, pair limits, diminishing returns) and verified-provider badges.
- **Moderation**: role hierarchy from resident to super admin, a moderator dashboard, weighted reports, blocking, escalation and an audit log.
- **WhatsApp bridge** (off by default): residents forward a message to the Hai WhatsApp bot, confirm it, and it is published anonymously to their neighbourhood feed. An optional AI step can rewrite or filter the message.
- **Invites**: personal invite codes with tiered badges and a leaderboard.
- **Notifications**: in-app notification centre plus native push (FCM / APNs), quiet hours and a weekly digest.
- **Phone sign-in**: OTP sent over WhatsApp, with SMS as a fallback.
- **Trilingual UI**: Arabic (default, RTL), English and Urdu, with on-demand post translation. Light, dark and system themes.
- **Store-ready**: self-service account deletion, privacy and terms pages, and a child-safety page. PWA support with an offline fallback.

## 🧱 Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS, design tokens in `src/app/design-tokens.css` |
| Database | PostgreSQL with Prisma 7 (`@prisma/adapter-pg`) |
| Auth | JWT sessions (`jose`) with phone OTP over WhatsApp Cloud API, Authentica SMS as fallback |
| Storage | Vercel Blob for images, audio and PDFs |
| Maps | MapLibre GL + MapTiler, with neighbourhood polygons for detection |
| Push | Firebase Cloud Messaging (Android), APNs (iOS) |
| Native shell | Capacitor 8 (Android + iOS) plus a local `hai-contacts` plugin |
| PWA | `next-pwa` |
| Hosting | Vercel (with Vercel Cron) |
| iOS CI | Codemagic |

## 🚀 Getting started

### Prerequisites

- Node.js 22 (the version used in CI)
- PostgreSQL
- For native builds: Android Studio and/or Xcode with CocoaPods

### Install

```bash
git clone https://github.com/mw4z/hai-app.git
cd hai-app
npm install          # also runs patch-package and prisma generate
```

### Environment variables

Create `.env.local` at the repo root. Only names are listed here; never commit values.

**Core**

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string used by the app |
| `DIRECT_URL` | Direct (non-pooled) connection for Prisma migrations; falls back to `DATABASE_URL` |
| `JWT_SECRET` | Signs session tokens |
| `CRON_SECRET` | Authorises calls to `/api/cron/*` |
| `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_BASE_URL` | Public base URL of the app |
| `HAI_SHARE_BASE` | Base URL used in shared post links |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access for uploads (read by `@vercel/blob`) |

**Login (OTP)**

| Variable | Purpose |
|----------|---------|
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` | WhatsApp Cloud API sender for OTP messages |
| `WHATSAPP_OTP_TEMPLATE_NAME`, `WHATSAPP_OTP_TEMPLATE_LANG` | Approved OTP message template |
| `WHATSAPP_GRAPH_VERSION` | Graph API version |
| `AUTHENTICA_API_KEY`, `AUTHENTICA_SENDER`, `AUTHENTICA_API_BASE`, `AUTHENTICA_API_BASE_V2`, `AUTHENTICA_TEMPLATE_ID`, `AUTHENTICA_EMAIL_TEMPLATE_ID`, `AUTHENTICA_APP_NAME` | SMS / email OTP fallback provider |
| `REVIEW_TEST_PHONE`, `REVIEW_TEST_CODE` | Fixed login for app-store reviewers |

**Email**

| Variable | Purpose |
|----------|---------|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Outgoing email (Nodemailer) |

**Push notifications**

| Variable | Purpose |
|----------|---------|
| `FCM_SERVICE_ACCOUNT_BASE64` | Firebase service account as one base64 line (preferred) |
| `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | Firebase credentials as separate fields |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY` / `APNS_KEY_BASE64`, `APNS_ENV` | Apple Push Notification service |

**Maps & places**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_MAPTILER_KEY` | Map tiles and geocoding |
| `GOOGLE_PLACES_API_KEY` | Place autocomplete, details and photos for the directory |

**Hashing secrets**

| Variable | Purpose |
|----------|---------|
| `SERVICE_PHONE_KEY`, `SERVICE_PHONE_PEPPER` | Encrypt and hash service-provider phone numbers |
| `REPORT_IP_HASH_SECRET` | Hashes reporter IPs for report weighting |
| `INVITE_IP_SALT` | Salts IP hashes for invite abuse checks |
| `EMERGENCY_CONFIRM_SECRET` | Signs emergency-alert confirmations (falls back to `CRON_SECRET`) |

**WhatsApp bridge** (inactive unless enabled)

| Variable | Purpose |
|----------|---------|
| `WHATSAPP_BRIDGE_ENABLED` | Master switch (`true` to enable) |
| `WHATSAPP_BRIDGE_MODE` | Bridge mode (defaults to `test`) |
| `WHATSAPP_BRIDGE_TEST_NEIGHBORHOOD_ID` | Target neighbourhood in test mode |
| `WHATSAPP_BRIDGE_SYSTEM_USER_ID` | Account that bridged posts are published under |
| `WHATSAPP_BRIDGE_REVIEW_FIRST` | Queue bridged posts for review instead of publishing |
| `WHATSAPP_BRIDGE_SECRET` | Shared secret for the ingest endpoint |
| `WHATSAPP_BRIDGE_SENDER_PEPPER` | Hashes sender numbers |
| `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Cloud API token, webhook signature check and verification |
| `WHATSAPP_BRIDGE_AI_ENABLED`, `WHATSAPP_BRIDGE_AI_MODEL`, `ANTHROPIC_API_KEY` | Optional AI rewrite/filter step |

**Feature flags**

| Variable | Purpose |
|----------|---------|
| `DIRECTORY_ENABLED`, `NEXT_PUBLIC_DIRECTORY_ENABLED` | Turn on the place directory (server and client) |
| `NEXT_PUBLIC_REQUEST_BOOST` | Request boosting in the feed (`0` to disable) |
| `NEXT_PUBLIC_STRUCTURED_POST_METADATA` | Show structured post sub-type chips (`1` to enable) |
| `NEXT_PUBLIC_ANDROID_STORE_URL`, `NEXT_PUBLIC_IOS_STORE_URL` | Store links shown in the app |

See [`WHATSAPP_BRIDGE_OFFICIAL_SETUP.md`](WHATSAPP_BRIDGE_OFFICIAL_SETUP.md) for setting up the bridge on Meta's side.

### Database

```bash
npm run db:push        # apply prisma/schema.prisma to the database
npx prisma db seed     # optional: seed data (prisma/seed.ts)
npm run db:studio      # browse data in Prisma Studio
```

Migration history lives in `prisma/migrations/`.

### Run

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | `prisma generate` + production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run test:policy` | Display-policy unit tests |
| `npm run test:classify` | Post-classification unit tests |
| `npm run test:user-ready` | User-readiness gate tests |
| `npm run lint:state-badges` | Checks that state badges go through the display policy |

## 📁 Project structure

| Path | Contents |
|------|----------|
| `src/app/` | App Router pages (feed, market, services, directory, rides, threads, polls, square, profile, admin, mod, legal …) |
| `src/app/api/` | API routes: auth, posts, rides, threads, notifications, uploads, bridge, cron jobs and more |
| `src/components/` | Shared UI components |
| `src/lib/` | Domain logic: auth, i18n, reputation, membership, moderation, rides, places, bridge, push |
| `src/hooks/` | React hooks (language, polling, GPS) |
| `prisma/` | `schema.prisma`, migrations and seed script |
| `scripts/` | Admin, seeding, boundary import, icon and store-asset generators |
| `plugins/hai-contacts/` | Local Capacitor plugin for contact picking |
| `android/`, `ios/` | Capacitor native projects |
| `public/` | Icons, PWA manifest, offline page, `.well-known` app-link files |
| `docs/`, `*.md` | Design notes: project overview, display policy, rides architecture, smoke tests |

## ☁️ Deployment

- **Web / API**: deployed on Vercel. `vercel.json` defines the region and the scheduled jobs under `/api/cron/*`: notification processing, ride timeouts, alert expiry, post archiving, invite rewards, weekly digest, moderator lifecycle, idle-thread closing and PDF cleanup.
- **Native apps**: `capacitor.config.ts` points the native shell at the hosted web app, and `out/offline.html` is bundled as the offline fallback. Run `npx cap sync` after changing native config or plugins.
- **iOS**: `codemagic.yaml` builds the web app, syncs Capacitor, signs with App Store Connect and uploads to TestFlight.
- **Android**: build from `android/` in Android Studio. Signing keys are loaded from an untracked `android/keystore.properties` locally, or from environment variables in CI.

---

<div align="center"><sub>© Hai. All rights reserved.</sub></div>

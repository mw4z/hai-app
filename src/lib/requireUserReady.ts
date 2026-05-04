import { NextResponse } from 'next/server'
import { db } from './db'

/**
 * ═══════════════════════════════════════════════════════════════════
 * Authenticated endpoint gate — single source of truth.
 * ═══════════════════════════════════════════════════════════════════
 *
 * One helper, one DB read, two checks:
 *   1. Profile completeness (User.name has >= 2 chars after trim)
 *   2. Location verification (User.addressVerified === true)
 *
 * Order matters. Completeness runs first so a user who finished OTP
 * but bailed before onboarding gets `next: '/onboarding'` rather than
 * the misleading `location_unverified` (they haven't even seen the
 * verify-location screen yet).
 *
 * SUPER_ADMIN bypasses LOCATION verification (legitimate cross-
 * neighborhood moderation), but NEVER bypasses profile completeness —
 * a blank-named admin would render as nothing in the UI, which is an
 * identity-integrity bug, not a permission gate. Bypass attempts are
 * logged for audit.
 *
 * ───────────────────────────────────────────────────────────────────
 * Endpoint policy table — keep updated when adding routes.
 * ───────────────────────────────────────────────────────────────────
 *
 * Profile + location required (requireUserReady() with defaults):
 *   POST   /api/posts
 *   POST   /api/posts/[id]/comments
 *   POST   /api/posts/[id]/react
 *   POST   /api/posts/report
 *   POST   /api/threads
 *   POST   /api/threads/[id]/messages
 *   POST   /api/threads/[id]/messages/[msgId]/react
 *   POST   /api/comments/[id]/like
 *   POST   /api/polls
 *   POST   /api/polls/[id]/comments
 *   POST   /api/polls/[id]/vote
 *   POST   /api/polls/[id]/react
 *   POST   /api/rides
 *   POST   /api/rides/[id]/offers
 *   POST   /api/emergency/request
 *   GET    /api/feed                  ← requires both as of this commit
 *
 * Profile required, location NOT required:
 *   POST   /api/posts/[id]/bookmark   (private, doesn't expose name)
 *   POST   /api/posts/[id]/subscribe  (private, doesn't expose name)
 *   POST   /api/profile/verify-address (the user is verifying NOW —
 *                                       requiring it would deadlock)
 *
 * Read-only — incomplete users allowed:
 *   GET    /api/notifications
 *   GET    /api/users/[id]
 *   GET    /api/posts/[id]
 *   GET    /api/feed (deliberately scoped to user's neighborhoodId
 *                     server-side — no cross-nbhd leak path)
 *   GET    /api/search/*
 *
 * Admin / system / cron — own auth checks, do NOT use this helper:
 *   /api/admin/*       (role check)
 *   /api/cron/*        (CRON_SECRET header)
 *   /api/auth/send-otp / verify-otp / complete-profile (pre-onboarding)
 *
 * ───────────────────────────────────────────────────────────────────
 */

export type UserReadyErrorCode =
  | 'PROFILE_INCOMPLETE'
  | 'LOCATION_UNVERIFIED'
  | 'UNAUTHORIZED'

export interface UserReadyUser {
  id: string
  name: string | null
  role: string
  addressVerified: boolean
}

export type UserReadyResult =
  | { ok: true; user: UserReadyUser }
  | { ok: false; code: UserReadyErrorCode; response: NextResponse }

interface Opts {
  requireProfile?: boolean
  requireLocation?: boolean
}

/**
 * Run the configured gates against `userId`. Returns a discriminated
 * union — narrow on `result.ok` and either consume `result.user` or
 * `return result.response` directly.
 *
 * The `code` field on the error branch is the canonical error key the
 * route handler can use to log / branch / instrument; the `response`
 * field carries the wire-format JSON the client expects, kept in sync
 * with the public contract:
 *
 *   { error: 'profile_incomplete' | 'location_unverified' | 'unauthorized',
 *     next:  '/onboarding'        | '/onboarding'         | '/login' }
 */
export async function requireUserReady(
  userId: string,
  opts: Opts = { requireProfile: true, requireLocation: true },
): Promise<UserReadyResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, addressVerified: true },
  })

  if (!user) {
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      response: NextResponse.json(
        { error: 'unauthorized', next: '/login' },
        { status: 401 },
      ),
    }
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN'

  // 1. Profile completeness — runs FIRST. No SUPER_ADMIN bypass:
  //    completeness is identity, not a permission. A blank-named
  //    admin renders as nothing in the UI; that's a real integrity
  //    bug we'd rather catch in dev/staging than ignore in prod.
  if (opts.requireProfile !== false) {
    const trimmed = user.name?.trim() ?? ''
    if (trimmed.length < 2) {
      if (isSuperAdmin) {
        console.warn(
          '[requireUserReady] SUPER_ADMIN with incomplete profile blocked',
          { userId },
        )
      }
      return {
        ok: false,
        code: 'PROFILE_INCOMPLETE',
        response: NextResponse.json(
          { error: 'profile_incomplete', next: '/onboarding' },
          { status: 403 },
        ),
      }
    }
  }

  // 2. Location verification — SUPER_ADMIN bypasses (legitimate
  //    cross-neighborhood moderation need).
  if (opts.requireLocation !== false && !isSuperAdmin) {
    if (!user.addressVerified) {
      return {
        ok: false,
        code: 'LOCATION_UNVERIFIED',
        response: NextResponse.json(
          { error: 'location_unverified', next: '/onboarding' },
          { status: 403 },
        ),
      }
    }
  }

  return {
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      addressVerified: user.addressVerified,
    },
  }
}

// Pure validators live in nameValidation.ts so they're testable
// without dragging in the Prisma client. Re-exported here for callers
// who already import from this module.
export { isValidFirstName, isValidLastName, NAME_LIMITS } from './nameValidation'

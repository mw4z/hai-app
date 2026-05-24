import { NextRequest, NextResponse } from 'next/server'
import { db } from './db'
import { getSession } from './auth'
import {
  requireUserReadyDecision,
  toUserReadyResponse,
  type UserReadyOpts,
  type UserReadyUser,
  type UserReadyErrorCode,
} from './userReadyDecision'

/**
 * ═══════════════════════════════════════════════════════════════════
 * Authenticated endpoint gate — single source of truth.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Three layers:
 *
 *   1. requireUserReadyDecision(user, opts)  — pure, in userReadyDecision.ts
 *   2. toUserReadyResponse(code)             — pure, in userReadyDecision.ts
 *   3. requireUserReady(userId, opts)        — I/O wrapper (this file)
 *   4. withUserReady(handler, opts)          — Next.js route wrapper
 *
 * Decision + transport are extracted so unit tests can import them
 * without booting Prisma. Most route handlers want this convenience
 * helper or the withUserReady wrapper.
 *
 * SUPER_ADMIN bypasses LOCATION verification (legitimate cross-
 * neighborhood moderation), but NEVER profile completeness — bypass
 * attempts log a warning. See userReadyDecision.ts for the rationale.
 *
 * ───────────────────────────────────────────────────────────────────
 * Endpoint policy table — keep updated when adding routes.
 * ───────────────────────────────────────────────────────────────────
 *
 * Profile + location required (default opts):
 *   POST   /api/posts
 *   POST   /api/posts/[id]/comments
 *   POST   /api/posts/[id]/react
 *   POST   /api/posts/report
 *   POST   /api/threads
 *   POST   /api/threads/[id]/messages
 *   POST   /api/threads/[id]/messages/[msgId]/react
 *   POST   /api/comments/[id]/like
 *   POST   /api/polls/[id]/comments
 *   POST   /api/polls/[id]/vote
 *   POST   /api/polls/[id]/react
 *   POST   /api/rides
 *   POST   /api/rides/[id]/offers
 *   POST   /api/emergency/request
 *   GET    /api/feed
 *
 * Profile required, location NOT required:
 *   POST   /api/posts/[id]/bookmark
 *   POST   /api/posts/[id]/subscribe
 *
 * Location required, profile NOT required:
 *   (none currently — verify-address handles its own auth)
 *
 * Read-only — no gate:
 *   GET    /api/notifications
 *   GET    /api/users/[id]
 *   GET    /api/posts/[id]
 *   GET    /api/search/*
 *
 * Admin / system / cron — own auth checks, do NOT use this helper:
 *   /api/admin/*       (role check)
 *   /api/cron/*        (CRON_SECRET header)
 *   /api/auth/send-otp / verify-otp / complete-profile (pre-onboarding)
 *
 * ───────────────────────────────────────────────────────────────────
 */

export type {
  UserReadyErrorCode,
  UserReadyUser,
  UserReadyOpts,
  UserReadyDecision,
} from './userReadyDecision'
export { requireUserReadyDecision, toUserReadyResponse } from './userReadyDecision'

export type UserReadyResult =
  | { ok: true; user: UserReadyUser }
  | { ok: false; code: UserReadyErrorCode; response: NextResponse }

/**
 * Convenience: fetch the user, run the decision, wrap the error in a
 * NextResponse. Most route handlers want this.
 */
export async function requireUserReady(
  userId: string,
  opts: UserReadyOpts = { requireProfile: true, requireLocation: true },
): Promise<UserReadyResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, addressVerified: true, membership: true },
  })
  const decision = requireUserReadyDecision(user, opts)
  if (decision.ok) return decision
  return { ok: false, code: decision.code, response: toUserReadyResponse(decision.code) }
}

/**
 * Higher-order route wrapper. Use as the export of an authenticated
 * route handler — fail-closed: if you forget to wrap the handler, you
 * don't get the gate, which is exactly what a reviewer should notice.
 *
 *   export const POST = withUserReady(async (req, user) => {
 *     // handler runs only with a complete & verified user
 *   })
 */
export function withUserReady(
  handler: (req: NextRequest, user: UserReadyUser) => Promise<NextResponse> | NextResponse,
  opts: UserReadyOpts = { requireProfile: true, requireLocation: true },
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const session = await getSession()
    if (!session) return toUserReadyResponse('UNAUTHORIZED')
    const result = await requireUserReady(session.userId, opts)
    if (!result.ok) return result.response
    return handler(req, result.user)
  }
}

export function withUserReadyParams<P extends Record<string, string>>(
  handler: (req: NextRequest, user: UserReadyUser, ctx: { params: P }) => Promise<NextResponse> | NextResponse,
  opts: UserReadyOpts = { requireProfile: true, requireLocation: true },
) {
  return async (req: NextRequest, ctx: { params: P }): Promise<NextResponse> => {
    const session = await getSession()
    if (!session) return toUserReadyResponse('UNAUTHORIZED')
    const result = await requireUserReady(session.userId, opts)
    if (!result.ok) return result.response
    return handler(req, result.user, ctx)
  }
}

// Pure validators in nameValidation.ts; re-exported for convenience.
export { isValidFirstName, isValidLastName, normalizeName, NAME_LIMITS } from './nameValidation'

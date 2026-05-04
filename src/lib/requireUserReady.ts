import { NextResponse } from 'next/server'
import { db } from './db'

/**
 * Single entry point for "can this authenticated user perform a
 * neighborhood-affecting action?" checks. Replaces scattered calls to
 * requireCompleteProfile + requireVerified at API call sites.
 *
 * Why one helper:
 *   - Order matters. Completeness must run BEFORE verified, so an
 *     incomplete user gets "go finish onboarding" rather than the
 *     misleading "verify your location" — they haven't even reached
 *     the screen that asks for location yet.
 *   - One DB read covers both checks. The previous shape did two
 *     separate findUnique calls (one per helper) and two cache
 *     lookups. This is cheaper AND removes the cache invariant
 *     entirely (see below).
 *   - Error shape is consistent: every caller can branch on
 *     `error: 'profile_incomplete' | 'location_unverified'` and
 *     redirect using `next`.
 *
 * Why no cache:
 *   - The fields being read (User.name, User.addressVerified,
 *     User.role) are tiny and indexed by primary key. The DB roundtrip
 *     is sub-millisecond on Supabase pooler.
 *   - The cache was creating its own invariant: a user could update
 *     their profile, get a stale 403 for up to 30 seconds, and not
 *     understand why. Removing it makes "I just submitted onboarding,
 *     why am I still locked out?" impossible.
 *   - Profile completeness is identity-integrity, not a perf gate.
 *     Worth a query.
 */

interface Opts {
  requireProfile?: boolean
  requireLocation?: boolean
}

interface ReadyResult {
  ok: true
  user: {
    id: string
    name: string | null
    role: string
    addressVerified: boolean
  }
}

interface ReadyError {
  ok: false
  response: NextResponse
}

/**
 * Run the configured gates against `userId`. Returns `{ ok: true, user }`
 * when all gates pass, or `{ ok: false, response }` carrying a 403
 * NextResponse the route handler should `return` directly.
 *
 * SUPER_ADMIN bypasses LOCATION verification (their account is platform-
 * owner and can act in any neighborhood for moderation), but NOT profile
 * completeness — completeness is identity, not a permission. A blank
 * super-admin would still render as nothing in the UI and is a real data-
 * integrity concern. The bypass attempt is logged for audit.
 */
export async function requireUserReady(
  userId: string,
  opts: Opts = { requireProfile: true, requireLocation: true },
): Promise<ReadyResult | ReadyError> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, addressVerified: true },
  })

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'unauthorized', next: '/login' },
        { status: 401 },
      ),
    }
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN'

  // 1. Profile completeness. Runs FIRST so an OTP-only / pre-onboarding
  //    user gets the right next-step. Trim-checked to mirror the
  //    /api/auth/complete-profile validation exactly. NO super-admin
  //    bypass here — see the helper-level comment.
  if (opts.requireProfile !== false) {
    const trimmed = user.name?.trim() ?? ''
    if (trimmed.length < 2) {
      if (isSuperAdmin) {
        // A super-admin without a name is a real anomaly. Log loudly
        // and still block — they should be the FIRST to have a clean
        // profile, and an automated tool should not be silently
        // succeeding past identity checks.
        console.warn('[requireUserReady] SUPER_ADMIN with incomplete profile blocked', { userId })
      }
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'profile_incomplete', next: '/onboarding' },
          { status: 403 },
        ),
      }
    }
  }

  // 2. Location verification. SUPER_ADMIN bypasses this one — they may
  //    legitimately moderate any neighborhood without being physically
  //    present.
  if (opts.requireLocation !== false && !isSuperAdmin) {
    if (!user.addressVerified) {
      return {
        ok: false,
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

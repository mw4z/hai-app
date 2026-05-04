import { NextResponse } from 'next/server'
import { requireUserReady } from './requireUserReady'

/**
 * Back-compat thin shim. New code should use `requireUserReady` directly
 * — it does both completeness and location checks in one DB read with
 * structured `{ error, next }` errors.
 *
 * The previous version of this helper had a 30-second per-user cache.
 * Removed: profile completeness is a sub-millisecond query on the
 * primary key, the cache was creating its own invariant (a freshly
 * onboarded user could see stale 403s), and the SUPER_ADMIN bypass
 * was wrong — completeness is identity, not a permission. The new
 * unified helper logs and blocks instead.
 */
export async function requireCompleteProfile(userId: string): Promise<NextResponse | null> {
  const result = await requireUserReady(userId, { requireProfile: true, requireLocation: false })
  return result.ok ? null : result.response
}

/** No-op kept for back-compat. The cache it used to invalidate is gone. */
export function invalidateCompleteProfileCache(_userId: string) {}

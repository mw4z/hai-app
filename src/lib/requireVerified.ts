import { NextResponse } from 'next/server'
import { requireUserReady } from './requireUserReady'

/**
 * Back-compat shim — every existing call site of requireVerified now
 * runs through requireUserReady, which checks profile completeness
 * BEFORE location verification. This means the 11 routes that already
 * had requireVerified (comments, reactions, ride offers, polls,
 * emergencies, etc.) now reject incomplete profiles too, with the
 * structured `{ error: 'profile_incomplete', next: '/onboarding' }`
 * response. No call site changes required.
 *
 * The previous version of this helper had a 30-second per-user cache
 * with a SUPER_ADMIN bypass for verification. Cache is removed —
 * profile + verification is a single sub-millisecond DB read on the
 * primary key, and the cache was creating its own staleness invariant.
 * SUPER_ADMIN still bypasses LOCATION verification (in
 * requireUserReady) but no longer bypasses profile completeness —
 * completeness is identity, not a permission.
 *
 * New code should call requireUserReady directly. This shim exists
 * only because rewriting every call site at once was unnecessary risk.
 */
export async function requireVerified(userId: string): Promise<NextResponse | null> {
  const result = await requireUserReady(userId, { requireProfile: true, requireLocation: true })
  return result.ok ? null : result.response
}

/** No-op kept for back-compat. The cache it used to invalidate is gone. */
export function invalidateVerifiedCache(_userId: string) {}

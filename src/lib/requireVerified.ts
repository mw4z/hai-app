import { NextResponse } from 'next/server'
import { requireUserReady } from './requireUserReady'

/**
 * @deprecated Use `requireUserReady` (full gate: profile + location)
 * or `requireLocationVerified` (location only) instead. This name was
 * misleading — it now ALSO enforces profile completeness, which a
 * caller couldn't infer from the function name. Existing call sites
 * keep working because this delegates to requireUserReady, but new
 * code should pick one of the two clearly-named helpers above.
 *
 * Behavior under the hood: identical to
 *   requireUserReady(userId, { requireProfile: true, requireLocation: true })
 *
 * Wire response shape (unchanged from earlier patches):
 *   profile incomplete  → 403 { error: 'profile_incomplete',  next: '/onboarding' }
 *   location unverified → 403 { error: 'location_unverified', next: '/onboarding' }
 */
export async function requireVerified(userId: string): Promise<NextResponse | null> {
  if (process.env.NODE_ENV !== 'production') {
    // Loud in dev / preview, silent in prod (we don't want to spam
    // logs while we migrate every call site, but we do want any
    // engineer touching the code to see the deprecation).
    console.warn(
      '[requireVerified] DEPRECATED — use requireUserReady or requireLocationVerified',
    )
  }
  const result = await requireUserReady(userId, { requireProfile: true, requireLocation: true })
  return result.ok ? null : result.response
}

/** No-op kept for back-compat; the cache it used to invalidate is gone. */
export function invalidateVerifiedCache(_userId: string) {}

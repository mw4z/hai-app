/**
 * REMOVED. This module used to wrap location verification (and, after
 * b44b19c, profile completeness too). The hidden coupling — a name
 * that suggested only "verified" but silently enforced both gates —
 * was misleading enough to be a foot-gun, so the helper was unified
 * into requireUserReady and explicit migrations of the call sites.
 *
 * Use one of:
 *   - requireUserReady(userId)              → profile + location
 *   - requireUserReady(userId, { requireLocation: false }) → profile only
 *   - requireLocationVerified(userId)       → location only
 *
 * Throws at runtime so any forgotten import surfaces immediately
 * rather than silently re-introducing the deprecated coupling.
 */
export function requireVerified(_userId: string): never {
  throw new Error(
    'requireVerified has been removed. Use requireUserReady (profile + location) or requireLocationVerified (location only).',
  )
}

export function invalidateVerifiedCache(_userId: string): never {
  throw new Error(
    'invalidateVerifiedCache has been removed. The 30-second per-user cache it used to invalidate no longer exists; profile/location is read fresh on every gate call.',
  )
}

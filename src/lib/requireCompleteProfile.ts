/**
 * REMOVED. Use:
 *   - requireUserReady(userId, { requireLocation: false }) → profile only
 *   - requireUserReady(userId)              → profile + location
 *
 * Throws at runtime so any forgotten import surfaces immediately.
 */
export function requireCompleteProfile(_userId: string): never {
  throw new Error(
    'requireCompleteProfile has been removed. Use requireUserReady(userId, { requireLocation: false }) for profile-only.',
  )
}

export function invalidateCompleteProfileCache(_userId: string): never {
  throw new Error(
    'invalidateCompleteProfileCache has been removed. The cache it invalidated no longer exists.',
  )
}

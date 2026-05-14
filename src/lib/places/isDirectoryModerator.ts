import type { UserRole } from '@prisma/client'

/**
 * Directory-specific moderation gate.
 *
 * Returns true ONLY for the three roles that can review directory
 * submissions / claims / reports:
 *
 *   - NEIGHBORHOOD_MOD — scoped to their own neighborhood
 *   - PLATFORM_MOD     — global review across all neighborhoods
 *   - SUPER_ADMIN      — global, bypasses every gate
 *
 * Intentionally EXCLUDES COMPOUND_ADMIN. Compound admins are scoped
 * to a single compound (gated community), not the whole neighborhood
 * directory. Folding them into directory moderation would give them
 * authority over places outside their compound, which is the wrong
 * default. Phase 1.5 may add a compound-scoped place sub-category;
 * until then compound admins have no role here.
 *
 * Pair with neighborhoodId scoping for NEIGHBORHOOD_MOD calls — see
 * the route handlers in src/app/api/mod/directory.
 */
export function isDirectoryModerator(role: UserRole | string | null | undefined): boolean {
  return role === 'NEIGHBORHOOD_MOD' || role === 'PLATFORM_MOD' || role === 'SUPER_ADMIN'
}

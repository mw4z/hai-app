/**
 * Moderator capability predicates. Pure + unit-testable, and used by BOTH
 * the /mod UI (to show/hide) and the API routes (to enforce) — never rely
 * on UI hiding alone.
 *
 * Boundary: neighborhood moderation stays local; provider verification is
 * a platform-wide trust action; and no one but SUPER_ADMIN may act on an
 * admin/mod account.
 */

const ADMIN_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']

/** Issue/revoke the platform-wide VERIFIED_PROVIDER badge. PLATFORM_MOD +
 *  SUPER_ADMIN only — NEIGHBORHOOD_MOD is deliberately barred (audit H-3:
 *  a local mod could otherwise manufacture verified providers). */
export function canVerifyProviders(role: string | null | undefined): boolean {
  return role === 'PLATFORM_MOD' || role === 'SUPER_ADMIN'
}

/** See + act on the moderation user list (block / stop). All mod roles;
 *  neighborhood scope is enforced separately in the API. */
export function canModerateUsers(role: string | null | undefined): boolean {
  return role === 'NEIGHBORHOOD_MOD' || role === 'PLATFORM_MOD' || role === 'SUPER_ADMIN'
}

/**
 * Can `actorRole` block/stop a user whose role is `targetRole`?
 * Only SUPER_ADMIN may control an admin/mod account; everyone else can
 * act on regular residents only. (Neighborhood scope is checked elsewhere.)
 */
export function canControlUser(
  actorRole: string | null | undefined,
  targetRole: string | null | undefined,
): boolean {
  if (actorRole === 'SUPER_ADMIN') return true
  if (!canModerateUsers(actorRole)) return false
  return !ADMIN_ROLES.includes(targetRole ?? '')
}

/**
 * Square access gate. Originally MVP-staged behind admin roles
 * (Neighborhood mods + Platform mods + Super admins). As of the
 * GA rollout we open Square to ALL residents — anyone with a
 * valid session + a resolved neighborhood can see and post.
 *
 * The function name + signature are kept (instead of inlining the
 * decision at call sites) so any future re-gating — e.g. banning
 * a specific role, or rate-limiting non-admins — is still a
 * one-line change here without touching the API routes, the page,
 * the bottom nav, etc.
 *
 * Use at BOTH the API layer (return 404 if false) and the page
 * layer (notFound() if false). UI-hiding alone is never a security
 * boundary.
 */

// Roles explicitly DENIED Square. Empty for now — everyone is in.
// To re-gate later, add roles here (e.g. add 'RESIDENT' to flip
// back to admin-only) without touching any call site.
const SQUARE_DENIED_ROLES = new Set<string>()

export function isSquareAdminRole(role: string | null | undefined): boolean {
  if (!role) return false
  if (SQUARE_DENIED_ROLES.has(role)) return false
  return true
}

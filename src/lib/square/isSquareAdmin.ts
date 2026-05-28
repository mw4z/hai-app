/**
 * Square admin gate. MVP rule: the Square feature is staged behind admin
 * roles — Neighborhood mods, Platform mods, and Super admins can see and
 * use it; regular residents can't see the tab, the routes, or the API.
 *
 * Centralised here so when we open Square to all residents in a later
 * phase, flipping the gate is a one-line change (return true) — every
 * call site reads from this single source.
 *
 * Use at BOTH the API layer (return 404) and the page layer (notFound()).
 * UI-hiding alone is never a security boundary.
 */
const SQUARE_ADMIN_ROLES = new Set(['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN'])

export function isSquareAdminRole(role: string | null | undefined): boolean {
  if (!role) return false
  return SQUARE_ADMIN_ROLES.has(role)
}

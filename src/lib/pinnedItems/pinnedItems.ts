/**
 * Pure helpers for neighborhood pinned items — duration→expiry, resident
 * visibility, and permission predicates. No DB. Used by BOTH the API
 * (enforce) and the UI (show/hide), never UI-only.
 *
 * Visibility is INDEPENDENT of the source content's feed/highlight expiry:
 * we only ever read the pinned item's OWN status/hiddenAt/expiresAt here.
 * Source deletion / moderation removal is checked separately by the
 * resolver (resolvePinnedSource).
 */

export type PinnedType = 'POST' | 'COMMENT' | 'MESSAGE' | 'FILE' | 'LINK' | 'MANUAL_NOTE'
export type PinnedStatus = 'ACTIVE' | 'HIDDEN' | 'EXPIRED' | 'REMOVED'
export type PinDuration = '24h' | '7d' | '30d' | 'forever' | 'custom'

export const PIN_DURATION_MS: Record<'24h' | '7d' | '30d', number> = {
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
}

/** Resolve a chosen duration to an absolute expiry. forever → null. A
 *  custom date must be valid and in the future, else null (treated as
 *  forever rather than instantly-expired). */
export function expiryFromDuration(duration: PinDuration, now: Date = new Date(), customISO?: string | null): Date | null {
  if (duration === 'forever') return null
  if (duration === 'custom') {
    if (!customISO) return null
    const d = new Date(customISO)
    return !isNaN(d.getTime()) && d.getTime() > now.getTime() ? d : null
  }
  const ms = PIN_DURATION_MS[duration]
  return ms ? new Date(now.getTime() + ms) : null
}

/**
 * Whether a pinned item is visible to a normal resident: ACTIVE, not
 * hidden, not expired. Source-deletion is enforced separately by the
 * resolver. NEVER consults the source's feed/highlight expiry.
 */
export function isVisibleToResident(
  item: { status: string; hiddenAt: Date | string | null; expiresAt: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (item.status !== 'ACTIVE') return false
  if (item.hiddenAt) return false
  if (item.expiresAt) {
    const exp = item.expiresAt instanceof Date ? item.expiresAt : new Date(item.expiresAt)
    if (exp.getTime() <= now.getTime()) return false
  }
  return true
}

const MANAGE_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']

/** Can this role manage pinned items at all? */
export function canManagePinned(role: string | null | undefined): boolean {
  return MANAGE_ROLES.includes(role ?? '')
}

/**
 * Can this role manage pinned items in a SPECIFIC neighborhood?
 * NEIGHBORHOOD_MOD is confined to their own neighborhood; PLATFORM_MOD /
 * SUPER_ADMIN are cross-neighborhood.
 */
export function canManageInNeighborhood(
  role: string | null | undefined,
  userNeighborhoodId: string | null | undefined,
  targetNeighborhoodId: string | null | undefined,
): boolean {
  if (role === 'SUPER_ADMIN' || role === 'PLATFORM_MOD') return true
  if (role === 'NEIGHBORHOOD_MOD') return !!userNeighborhoodId && userNeighborhoodId === targetNeighborhoodId
  return false
}

export const PINNED_TYPES: readonly string[] = ['POST', 'COMMENT', 'MESSAGE', 'FILE', 'LINK', 'MANUAL_NOTE']
export function isValidPinnedType(v: unknown): v is PinnedType {
  return typeof v === 'string' && PINNED_TYPES.includes(v)
}

import { NextResponse } from 'next/server'
import { directoryServerMode } from './featureFlag'
import { isDirectoryModerator } from './isDirectoryModerator'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'

/**
 * Standardized 404 for a feature-flagged route. Returns the same
 * shape every directory API uses so the client treats unset-flag
 * and missing-route uniformly.
 */
export function featureDisabled404() {
  return NextResponse.json({ error: 'feature_disabled' }, { status: 404 })
}

/** Apply DIRECTORY_ENABLED gating for a non-mod (public-style)
 *  route. Returns null when the request should proceed, or a
 *  NextResponse to short-circuit.
 *
 *  - 'off'   → only SUPER_ADMIN passes.
 *  - 'admin' → only directory moderators (NEIGHBORHOOD_MOD,
 *              PLATFORM_MOD, SUPER_ADMIN) pass.
 *  - 'on'    → everyone passes (no role check here; downstream
 *              code still applies per-action gates). */
export function gatePublicRoute(role: string | null | undefined): NextResponse | null {
  const mode = directoryServerMode()
  if (mode === 'on') return null
  if (mode === 'admin') {
    return isDirectoryModerator(role) ? null : featureDisabled404()
  }
  // mode === 'off'
  return isSuperAdminRole(role) ? null : featureDisabled404()
}

/** Apply DIRECTORY_ENABLED gating + role check for mod-only routes.
 *
 *  Even when 'on', only directory moderators may hit these routes —
 *  the public flag doesn't grant mod authority. */
export function gateModRoute(role: string | null | undefined): NextResponse | null {
  if (directoryServerMode() === 'off' && !isSuperAdminRole(role)) {
    return featureDisabled404()
  }
  if (!isDirectoryModerator(role)) {
    return featureDisabled404()
  }
  return null
}

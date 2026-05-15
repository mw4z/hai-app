import { directoryUIVisible } from './featureFlag'

/**
 * Client-side visibility check for the "مكان من دليل الحي"
 * attachment option in composers.
 *
 * Rules (per spec):
 *   - Residents: only when NEXT_PUBLIC_DIRECTORY_ENABLED=1
 *     (directoryUIVisible() is true).
 *   - Mods / admin (SUPER_ADMIN / PLATFORM_MOD / NEIGHBORHOOD_MOD):
 *     always show, so they can test the flow while directory is
 *     still admin-gated. The picker API + preview API enforce the
 *     server-side directoryServerMode() check independently, so a
 *     mod-role user on an "off" deploy still gets no results.
 *
 * Intentionally does NOT read directoryServerMode() — that's server-
 * only env. Server-side enforcement happens in the picker + preview
 * routes; this helper is just for the visual gate.
 */
const MOD_ROLES = ['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD']

export function canAttachDirectoryPlace(role: string | undefined | null): boolean {
  if (role && MOD_ROLES.includes(role)) return true
  return directoryUIVisible()
}

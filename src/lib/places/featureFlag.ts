/**
 * Directory feature-flag gates.
 *
 * Two independent flags so server availability and UI visibility
 * can be flipped separately during rollout:
 *
 *   DIRECTORY_ENABLED           (server) gates API routes + SSR pages
 *   NEXT_PUBLIC_DIRECTORY_ENABLED (UI)   gates feed/profile/ask entry points
 *
 * Default deploy posture: DIRECTORY_ENABLED=admin,
 * NEXT_PUBLIC_DIRECTORY_ENABLED unset/0. No public surface visible;
 * SUPER_ADMIN and mods can hit /directory via direct URL to test the
 * full mod review flow on real submissions.
 */

export type DirectoryServerMode = 'off' | 'admin' | 'on'

/**
 * Read the server-side gate. Process-env only — this is for use in
 * route handlers and server components, never on the client.
 *
 *   'off'   → APIs/SSR return 404 to everyone except SUPER_ADMIN.
 *   'admin' → APIs/SSR available to SUPER_ADMIN / PLATFORM_MOD /
 *             NEIGHBORHOOD_MOD only. Residents get 404.
 *   'on'    → APIs/SSR available to all authenticated users (still
 *             role-gated per action).
 */
export function directoryServerMode(): DirectoryServerMode {
  const v = process.env.DIRECTORY_ENABLED
  if (v === '1' || v === 'on') return 'on'
  if (v === 'admin') return 'admin'
  return 'off'
}

/**
 * UI flag — does the client render visible entry points (feed card,
 * profile section, /ask chip)? Safe to read from client components
 * because the variable is NEXT_PUBLIC_*.
 *
 * Defaults to hidden. Flipping this on while DIRECTORY_ENABLED is
 * still off would render entry points that lead to 404s; that's
 * the configured-wrong case and we explicitly do NOT handle it
 * here (it would just be visually broken, no crash).
 */
export function directoryUIVisible(): boolean {
  return process.env.NEXT_PUBLIC_DIRECTORY_ENABLED === '1'
}

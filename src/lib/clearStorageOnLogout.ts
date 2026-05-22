/**
 * Logout storage wipe that PRESERVES device-level UX preferences.
 *
 * Logout clears localStorage (cached user data) AND, on Capacitor, calls
 * CapacitorCookies.clearAllCookies() — which wipes every cookie. That used
 * to nuke BOTH the localStorage flag and the cookie mirror that mark the
 * first-run guide / tours as "seen", so they replayed on every re-login.
 *
 * These flags describe what THIS DEVICE's user has already seen — not the
 * account — so they must survive logout. New accounts still get them reset
 * in onboarding/. Everything else (user id, drafts, caches) is cleared.
 */
const PRESERVE_PREFIXES = [
  'hai:first-run-guide',          // FirstRunGuide (مرشد الحي)
  'hai:context-guide',            // ContextualGuide per-page + …-disabled
  'hai_tour_',                    // global Tour flow flags
  'hai_theme',                    // dark/light preference
  'hai_splash',                   // splash-shown flag
]

export function clearLocalStoragePreservingPrefs(): void {
  try {
    const saved: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && PRESERVE_PREFIXES.some((p) => k.startsWith(p))) {
        const v = localStorage.getItem(k)
        if (v !== null) saved[k] = v
      }
    }
    localStorage.clear()
    for (const [k, v] of Object.entries(saved)) localStorage.setItem(k, v)
  } catch {
    // localStorage unavailable (private mode) — nothing to preserve.
  }
}

'use client'

import { useEffect } from 'react'

/**
 * Permanent cache-bust for the PWA service worker.
 *
 * next-pwa caches JS/CSS with StaleWhileRevalidate, so a fresh deploy
 * otherwise only appears on the SECOND launch ("one launch behind"). The SW
 * is built with skipWaiting + clientsClaim, so a new SW activates and takes
 * control quickly after it installs. When that happens (`controllerchange`)
 * we reload ONCE so the *current* launch picks up the new assets — no manual
 * double-restart needed.
 *
 * We only reload on an UPDATE (a controller already existed at mount), never
 * on the very first install, to avoid a reload on a user's first-ever visit.
 */
export default function SwUpdateReload() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    // No controller yet → first install. The SW will control the next
    // navigation naturally; don't force a reload now.
    if (!navigator.serviceWorker.controller) return

    let reloaded = false
    const RECENT_DEEPLINK_WINDOW_MS = 30_000
    const onControllerChange = () => {
      if (reloaded) return
      // If a push deep-link landed on this page in the last 30s,
      // skip the auto-reload entirely. The new SW will activate on
      // the next cold start anyway — better to land the user on the
      // conversation cleanly than to fight a flaky cold-start reload
      // that can fall through to offline.html and bounce them back
      // to /feed via the bare-URL redirect.
      try {
        const ts = sessionStorage.getItem('hai:deeplink-landed-at')
        if (ts) {
          const age = Date.now() - Number(ts)
          if (Number.isFinite(age) && age < RECENT_DEEPLINK_WINDOW_MS) {
            console.log('[SW] skipping reload — deeplink landed', age, 'ms ago')
            return
          }
        }
      } catch {}
      reloaded = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    // Proactively ask the browser to check for a new SW on launch (instead
    // of waiting for its periodic check), so updates land fast.
    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.update().catch(() => { /* offline / no update — fine */ })
    }).catch(() => {})

    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [])

  return null
}

'use client'

import { useEffect, useRef } from 'react'

/*
 * AppSplash — NATIVE-ONLY intro mode.
 *
 * Per user decision: a single intro layer (the native Capacitor
 * SplashScreen overlay) is the entire intro. This component
 * intentionally renders NOTHING — its only job is to dismiss the
 * native overlay at the right moment:
 *
 *   - on window.load (page is ready), AND
 *   - after a minimum display so an instant-paint launch still
 *     reads as "the app launched" rather than a flicker, AND
 *   - after any pending share-link / push deeplink has resolved
 *     (FeedClient clears hai:deeplink-redirect when the
 *     highlight effect lands)
 *
 * No CSS, no DOM, no animation choreography. Everything you see
 * on launch is the iOS storyboard handoff into the Capacitor
 * SplashScreen plugin overlay — both showing the same monochrome
 * brand mark from the regenerated Splash.imageset PNGs /
 * ic_launcher_splash drawables.
 *
 * If a future product decision wants the JS animated intro back,
 * the previous senior-pass version lives in git history at
 * commit 6418ec0. Restore by checking out that AppSplash.tsx and
 * flipping capacitor.config.ts SplashScreen.launchAutoHide back
 * to true / launchShowDuration back to 0.
 */

const MIN_MS = 150
const HOLD_CEILING_MS = 6000

function deeplinkPending() {
  try { return sessionStorage.getItem('hai:deeplink-redirect') === '1' } catch { return false }
}

export default function AppSplash() {
  const mountTime = useRef(Date.now())

  useEffect(() => {
    const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform()
    if (!isNative) return

    let pollTimer: ReturnType<typeof setTimeout> | null = null

    async function hideNativeSplash() {
      try {
        const { SplashScreen } = await import('@capacitor/splash-screen')
        // 180 ms fade — quick enough to feel snappy, slow enough
        // not to be a hard cut.
        await SplashScreen.hide({ fadeOutDuration: 180 })
      } catch {}
    }

    function tryHide() {
      const elapsed = Date.now() - mountTime.current
      if (elapsed >= HOLD_CEILING_MS) {
        try { sessionStorage.removeItem('hai:deeplink-redirect') } catch {}
        hideNativeSplash()
        return
      }
      if (deeplinkPending()) {
        pollTimer = setTimeout(tryHide, 150)
        return
      }
      if (elapsed < MIN_MS) {
        pollTimer = setTimeout(tryHide, MIN_MS - elapsed)
        return
      }
      hideNativeSplash()
    }

    // Fire ASAP. React has already hydrated by the time this
    // useEffect runs, so the page is interactive — no reason to
    // wait for window.load (which would otherwise block on
    // images / fonts). MIN_MS below is the floor; tryHide will
    // wait that long even on an instant-mount.
    tryHide()

    return () => {
      if (pollTimer) clearTimeout(pollTimer)
    }
  }, [])

  // Renders nothing — the visible splash is the native Capacitor
  // overlay. This component is only here to orchestrate WHEN that
  // overlay dismisses.
  return null
}

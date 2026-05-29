'use client'

import { useState, useEffect, useRef } from 'react'

/*
 * AppSplash — flicker-free static splash
 *
 * Composition:
 *  - Plain white (light) / plain black (dark) bg
 *  - Centered outline icon (84 px, 12 px stroke), monochrome
 *  - "حَيّ / HAI" brand pair at the bottom
 *
 * Anti-flicker principles:
 *  1. AppSplash renders at opacity 1 from frame 1 — NO fade-in.
 *     Native splash PNG matches the composition exactly, so the
 *     two layers are visually identical and the handoff doesn't
 *     need a crossfade. Removing the fade kills the ~150 ms window
 *     where both layers were semi-transparent and the underlying
 *     WebView's loading state was bleeding through.
 *  2. SplashScreen.hide() fires on rAF AFTER AppSplash's first
 *     paint, with zero fade duration — guarantees AppSplash is
 *     on screen before the native overlay disappears.
 *  3. On a share-link / push deeplink, AppSplash STAYS rendered
 *     on the destination mount (even when alreadyShown is true)
 *     until FeedClient clears hai:deeplink-redirect — prevents
 *     the brief uncovered moment between page hops.
 *  4. Single 300 ms opacity fade-OUT on dismiss. No scale,
 *     rotation, blur, iris, or other transitions.
 */

const SESSION_KEY = 'hai_splash'
const MIN_MS = 600
const FADE_OUT_MS = 300
const HOLD_CEILING_MS = 8000

function alreadyShown() {
  try { return !!sessionStorage.getItem(SESSION_KEY) } catch { return false }
}

function deeplinkPending() {
  try { return sessionStorage.getItem('hai:deeplink-redirect') === '1' } catch { return false }
}

export default function AppSplash() {
  // Initial phase:
  //  - First mount of the session → 'show' (full splash plays)
  //  - Subsequent mount but a deeplink is in flight → 'show' too,
  //    so we bridge the page hop without exposing the WebView
  //  - Otherwise → 'gone' (returns null, only hides native splash)
  const [phase, setPhase] = useState<'show' | 'fade' | 'gone'>(() => {
    if (!alreadyShown()) return 'show'
    if (deeplinkPending()) return 'show'
    return 'gone'
  })
  const mountTime = useRef(Date.now())

  useEffect(() => {
    if (phase === 'show') {
      try { sessionStorage.setItem(SESSION_KEY, '1') } catch {}
    }

    const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform()

    async function hideNativeSplash(fadeMs: number) {
      if (!isNative) return
      try {
        const { SplashScreen } = await import('@capacitor/splash-screen')
        await SplashScreen.hide({ fadeOutDuration: fadeMs })
      } catch {}
    }

    // Defer the native hide until AFTER AppSplash has been painted.
    // rAF nested twice = "the frame after the next composite" —
    // guarantees the AppSplash div is on the GPU before the native
    // overlay disappears. Zero fade duration; the visuals match.
    if (phase !== 'gone') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => hideNativeSplash(0))
      })
    } else {
      // Phase is already 'gone' — the splash is just here to ensure
      // the native overlay is down on subsequent mounts. 250 ms fade
      // matches the previous behaviour.
      hideNativeSplash(250)
      return
    }

    let goneTimer: ReturnType<typeof setTimeout>
    let pollTimer: ReturnType<typeof setTimeout> | null = null

    function dismiss() {
      setPhase('fade')
      goneTimer = setTimeout(() => setPhase('gone'), FADE_OUT_MS)
    }

    function tryDismiss() {
      const elapsed = Date.now() - mountTime.current
      if (elapsed >= HOLD_CEILING_MS) {
        try { sessionStorage.removeItem('hai:deeplink-redirect') } catch {}
        dismiss()
        return
      }
      if (deeplinkPending()) {
        pollTimer = setTimeout(tryDismiss, 150)
        return
      }
      if (elapsed < MIN_MS) {
        pollTimer = setTimeout(tryDismiss, MIN_MS - elapsed)
        return
      }
      dismiss()
    }

    if (document.readyState === 'complete') {
      tryDismiss()
    } else {
      window.addEventListener('load', tryDismiss, { once: true })
    }

    return () => {
      clearTimeout(goneTimer)
      if (pollTimer) clearTimeout(pollTimer)
      window.removeEventListener('load', tryDismiss)
    }
  }, [])

  if (phase === 'gone') return null

  return (
    <div className={`_sp ${phase === 'fade' ? '_sp-out' : ''}`} aria-hidden="true">
      <div className="_sp-icon-wrap">
        <svg className="_sp-icon" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="6" width="180" height="180" rx="40"
                fill="none" stroke="currentColor" strokeWidth="12" />
          <circle cx="96" cy="96" r="73.5"
                  fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.2" />
          <circle cx="96" cy="96" r="57"
                  fill="none" stroke="currentColor" strokeOpacity="0.34" strokeWidth="1.6" />
          <circle cx="96" cy="96" r="19.5" fill="currentColor" />
          <circle cx="96"    cy="39"    r="9.5" fill="currentColor" />
          <circle cx="145.5" cy="124.5" r="9.5" fill="currentColor" />
          <circle cx="46.5"  cy="124.5" r="9.5" fill="currentColor" />
        </svg>
      </div>

      <div className="_sp-brand">
        <span className="_sp-ar">حَيّ</span>
        <span className="_sp-en">HAI</span>
      </div>

      <style jsx>{`
        /* No fade-in animation — opacity is 1 from frame 1 so the
           native overlay hides into an already-painted AppSplash. */
        ._sp {
          position: fixed;
          top: 0; right: 0; bottom: 0; left: 0;
          z-index: 9990;
          color: #0a0a0a;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 1;
        }
        :global(.dark) ._sp {
          color: #ffffff;
          background: #000000;
        }
        ._sp-out {
          animation: _sp-out ${FADE_OUT_MS}ms ease-out forwards;
          pointer-events: none;
          will-change: opacity;
        }
        @keyframes _sp-out {
          from { opacity: 1; }
          to   { opacity: 0; }
        }

        ._sp-icon-wrap {
          width: 84px;
          height: 84px;
        }
        ._sp-icon { width: 100%; height: 100%; display: block; }

        ._sp-brand {
          position: absolute;
          bottom: max(env(safe-area-inset-bottom, 0px), 56px);
          left: 0; right: 0;
          text-align: center;
          font-family: 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        ._sp-ar {
          font-size: 22px;
          font-weight: 700;
          display: block;
          line-height: 1;
          color: currentColor;
        }
        ._sp-en {
          font-size: 10px;
          margin-top: 6px;
          letter-spacing: 4px;
          font-weight: 600;
          display: block;
          opacity: 0.55;
          color: currentColor;
        }
      `}</style>
    </div>
  )
}

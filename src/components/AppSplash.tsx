'use client'

import { useState, useEffect, useRef } from 'react'

/*
 * AppSplash — calm static splash
 *
 *  - Plain white (light) / plain black (dark) background
 *  - Centered outline icon (84 px, 12 px stroke), monochrome — ink
 *    color flips with the OS theme via CSS var, matching the
 *    native splash PNG so the native → JS handoff is invisible
 *  - "حَيّ / HAI" brand pair at the bottom, same ink color
 *  - Simple opacity fade-in on mount, simple opacity fade-out on
 *    dismiss. NO scaling, rotation, iris-open, parallax, or other
 *    animation theatrics.
 *
 * Dismiss rules:
 *  - Min 600 ms visible so an instant-paint launch still reads as
 *    "the app launched" rather than a flicker.
 *  - Hard 8 s ceiling so a slow page can't pin the splash.
 *  - When a share-link / push deeplink is in flight
 *    (hai:deeplink-redirect set by PostShareView /
 *    CapacitorBridge), wait for FeedClient to clear the flag
 *    before dismissing — keeps the splash up across the
 *    intermediate /s/post → /feed?post hop.
 *
 * On native: capacitor.config.ts has launchAutoHide:false, so the
 * native splash sits in front of the WebView until we explicitly
 * call SplashScreen.hide(). We hide it the instant AppSplash mounts
 * because the native PNG already matches AppSplash's static
 * composition — the crossfade is invisible.
 */

const SESSION_KEY = 'hai_splash'
const MIN_MS = 600
const FADE_IN_MS = 300
const FADE_OUT_MS = 300
const HOLD_CEILING_MS = 8000

function alreadyShown() {
  try { return !!sessionStorage.getItem(SESSION_KEY) } catch { return false }
}

function deeplinkPending() {
  try { return sessionStorage.getItem('hai:deeplink-redirect') === '1' } catch { return false }
}

export default function AppSplash() {
  const [phase, setPhase] = useState<'show' | 'fade' | 'gone'>(() => alreadyShown() ? 'gone' : 'show')
  const mountTime = useRef(Date.now())

  useEffect(() => {
    if (phase === 'show') {
      try { sessionStorage.setItem(SESSION_KEY, '1') } catch {}
    }

    const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform()

    async function hideNativeSplash() {
      if (!isNative) return
      try {
        const { SplashScreen } = await import('@capacitor/splash-screen')
        await SplashScreen.hide({ fadeOutDuration: 250 })
      } catch {}
    }

    // Native splash hides immediately. Its PNG matches our static
    // composition so there's no visible jump — the user sees the
    // same icon either way.
    hideNativeSplash()

    if (phase === 'gone') return

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
        ._sp {
          position: fixed;
          top: 0; right: 0; bottom: 0; left: 0;
          z-index: 9990;
          color: #0a0a0a;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: _sp-in ${FADE_IN_MS}ms ease-out both;
          will-change: opacity;
        }
        :global(.dark) ._sp {
          color: #ffffff;
          background: #000000;
        }
        ._sp-out {
          animation: _sp-out ${FADE_OUT_MS}ms ease-out forwards;
          pointer-events: none;
        }
        @keyframes _sp-in {
          from { opacity: 0; }
          to   { opacity: 1; }
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

'use client'

import { useState, useEffect, useRef } from 'react'

/*
 * AppSplash — X-style senior pass
 *
 * Composition:
 *   - Plain black (dark) / white (light) background
 *   - Centered outline icon (84 px, 12 px square stroke), monochrome —
 *     ink color flips per OS theme
 *   - "حَيّ / HAI" brand pair at the bottom, same ink color
 *
 * Timeline (2400 ms total):
 *   0–8 %    entry overshoot scale-in
 *   8–60 %   subtle breath (scale ±1 %)
 *   60–70 %  wind-up tighten (anticipation)
 *   70–100 % parallax explosion:
 *               · whole icon scales 0.92 → 14 and rotates 0 → 110°
 *               · satellites stack +160° rotation, scale 1 → 1.75 (vortex)
 *               · core counter-rotates −40°, scales 1 → 0.85 (gear)
 *               · splash bg gets an iris-shaped mask hole growing from
 *                 the icon's center → reveals the page underneath
 *               · single faint ring pulse telegraphs the climax (63–78 %)
 *   final 8 % the icon fades while the iris finishes opening
 *
 * Native splash handoff:
 *   capacitor.config.ts sets launchAutoHide:false. AppSplash calls
 *   SplashScreen.hide() at the start of its own climax (70 % mark)
 *   so the native overlay's 300 ms fade ends in sync with AppSplash's
 *   iris-open. One continuous reveal, no double-fade.
 */

const SESSION_KEY = 'hai_splash'
const TOTAL_MS = 2400
const FADE_MS = 700  // climax window (last 30 % of timeline)

function alreadyShown() {
  try { return !!sessionStorage.getItem(SESSION_KEY) } catch { return false }
}

function deeplinkPending() {
  try { return sessionStorage.getItem('hai:deeplink-redirect') === '1' } catch { return false }
}

export default function AppSplash() {
  const [phase, setPhase] = useState<'show' | 'gone'>(() => alreadyShown() ? 'gone' : 'show')
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
        // 300 ms fade — lines up with the JS climax window so the
        // native overlay's exit finishes during the iris-open.
        await SplashScreen.hide({ fadeOutDuration: 300 })
      } catch {}
    }

    if (phase === 'gone') {
      // Returning session / page navigation — AppSplash already
      // played once. Just ensure the native splash is down.
      hideNativeSplash()
      return
    }

    // Hide the native splash IMMEDIATELY so the JS animation is
    // actually visible. The Capacitor SplashScreen plugin renders
    // a native UIView in front of the WKWebView — until we call
    // hide() the user sees the static native splash overlay, not
    // AppSplash. The native splash's PNG already matches AppSplash's
    // settled state (monochrome icon on white/black), so the
    // crossfade is invisible: the native overlay fades out as the
    // JS AppSplash fades in with the same icon in the same spot.
    hideNativeSplash()

    let unmountTimer: ReturnType<typeof setTimeout>
    let deeplinkTimer: ReturnType<typeof setTimeout> | null = null

    // 8 s ceiling so a non-finding post can't pin the splash forever.
    const HOLD_CEILING_MS = 8000

    function startExit() {
      // Unmount after the full animation finishes. The native
      // splash is already long gone — only the JS overlay remains
      // to play the climax + iris-open reveal.
      unmountTimer = setTimeout(() => setPhase('gone'), TOTAL_MS + 80)
    }

    function tryStart() {
      const elapsed = Date.now() - mountTime.current
      if (elapsed >= HOLD_CEILING_MS) {
        try { sessionStorage.removeItem('hai:deeplink-redirect') } catch {}
        startExit()
        return
      }
      if (deeplinkPending()) {
        deeplinkTimer = setTimeout(tryStart, 150)
        return
      }
      const MIN_MS = 600
      if (elapsed < MIN_MS) {
        deeplinkTimer = setTimeout(tryStart, MIN_MS - elapsed)
        return
      }
      startExit()
    }

    if (document.readyState === 'complete') {
      tryStart()
    } else {
      window.addEventListener('load', tryStart, { once: true })
    }

    return () => {
      clearTimeout(unmountTimer)
      if (deeplinkTimer) clearTimeout(deeplinkTimer)
      window.removeEventListener('load', tryStart)
    }
  }, [])

  if (phase === 'gone') return null

  return (
    <div className="_sp" aria-hidden="true">
      {/* Splash bg — solid color until the climax, then iris-out
          via mask to reveal the page beneath. Sits BELOW the icon
          stage so the icon stays on top while zooming through. */}
      <div className="_sp-bg" />

      {/* Single faint ring that telegraphs the climax — appears at
          63 %, expands and fades through 78 %. */}
      <div className="_sp-ring" />

      {/* Icon stage — sits above everything. */}
      <div className="_sp-icon-wrap">
        <svg className="_sp-icon" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
          {/* Core: square outline + 2 inner rings + center dot.
              Exits SLOWER (scale 0.85) and counter-rotates (−40°). */}
          <g className="_sp-core">
            <rect x="6" y="6" width="180" height="180" rx="40"
                  fill="none" stroke="currentColor" strokeWidth="12" />
            <circle cx="96" cy="96" r="73.5"
                    fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.2" />
            <circle cx="96" cy="96" r="57"
                    fill="none" stroke="currentColor" strokeOpacity="0.34" strokeWidth="1.6" />
            <circle cx="96" cy="96" r="19.5" fill="currentColor" />
          </g>
          {/* Satellites: exit FASTER (scale 1.75) and whirl outward
              (+160° rotation). Stacks the parent's rotation for
              ~+270° net spin during the climax. */}
          <g className="_sp-sats">
            <circle cx="96"    cy="39"    r="9.5" fill="currentColor" />
            <circle cx="145.5" cy="124.5" r="9.5" fill="currentColor" />
            <circle cx="46.5"  cy="124.5" r="9.5" fill="currentColor" />
          </g>
        </svg>
      </div>

      {/* Brand pair — Arabic dominant, English subordinate,
          monochrome ink. Floats up + scales 1.15 → 1.4 during the
          climax then fades only in the final 8 %. */}
      <div className="_sp-brand">
        <span className="_sp-ar">حَيّ</span>
        <span className="_sp-en">HAI</span>
      </div>

      <style jsx>{`
        /* Ink color flips per OS theme — black on white in light,
           white on black in dark. Just like X. */
        ._sp {
          position: fixed;
          top: 0; right: 0; bottom: 0; left: 0;
          z-index: 9990;
          color: #0a0a0a;
          pointer-events: none;
        }
        :global(.dark) ._sp { color: #ffffff; }

        /* @property declarations let the iris radius animate
           smoothly between keyframes. Without these, the radial-
           gradient stops would snap rather than tween. */
        @property --iris-r {
          syntax: '<percentage>';
          inherits: false;
          initial-value: 0%;
        }

        ._sp-bg {
          position: absolute;
          inset: 0;
          background: #ffffff;
          --iris-r: 0%;
          -webkit-mask-image: radial-gradient(circle at 50% 50%, transparent var(--iris-r), #000 calc(var(--iris-r) + 0.5%));
          mask-image: radial-gradient(circle at 50% 50%, transparent var(--iris-r), #000 calc(var(--iris-r) + 0.5%));
          animation: _sp-iris ${TOTAL_MS}ms cubic-bezier(0.55, 0, 0.1, 1) both;
          will-change: --iris-r;
        }
        :global(.dark) ._sp-bg { background: #000000; }

        @keyframes _sp-iris {
          0%, 70% { --iris-r: 0%; }
          100%    { --iris-r: 160%; }
        }

        /* Icon stage — bigger (84px) than the old AppSplash logo
           (68px) for stronger presence. Bolder stroke too. */
        ._sp-icon-wrap {
          position: absolute;
          top: 50%; left: 50%;
          width: 84px; height: 84px;
          transform: translate(-50%, -50%);
          z-index: 3;
          will-change: transform, filter, opacity;
          animation: _sp-icon ${TOTAL_MS}ms both;
          animation-timing-function: linear;
        }
        ._sp-icon { width: 100%; height: 100%; display: block; }

        @keyframes _sp-icon {
          0%   { transform: translate(-50%, -50%) scale(0.30); opacity: 0; filter: blur(2px); }
          4%   { opacity: 1; filter: blur(0); }
          8%   { transform: translate(-50%, -50%) scale(1.06); }
          13%  { transform: translate(-50%, -50%) scale(1.00); }
          32%  { transform: translate(-50%, -50%) scale(1.012); }
          52%  { transform: translate(-50%, -50%) scale(0.998); }
          60%  { transform: translate(-50%, -50%) scale(1.00); }
          70%  { transform: translate(-50%, -50%) scale(0.92) rotate(0deg); filter: blur(0); }
          82%  { transform: translate(-50%, -50%) scale(2.20) rotate(32deg); filter: blur(0.5px); }
          92%  { transform: translate(-50%, -50%) scale(7.50) rotate(80deg); opacity: 1; filter: blur(1.5px); }
          100% { transform: translate(-50%, -50%) scale(14)   rotate(120deg); opacity: 0; filter: blur(5px); }
        }

        /* Satellites + core get their own animations on top of the
           parent's. SVG transforms compose so each group ends up
           with parent-rotation + own-rotation. */
        ._sp-sats {
          animation: _sp-sats ${TOTAL_MS}ms both;
          transform-origin: 96px 96px;
        }
        :global(._sp) ._sp-sats { /* :global ensures SVG group selector works */ }
        @keyframes _sp-sats {
          0%, 70%  { transform: scale(1) rotate(0deg); }
          100%     { transform: scale(1.75) rotate(160deg); }
        }
        ._sp-core {
          animation: _sp-core ${TOTAL_MS}ms both;
          transform-origin: 96px 96px;
        }
        @keyframes _sp-core {
          0%, 70%  { transform: scale(1) rotate(0deg); }
          100%     { transform: scale(0.82) rotate(-40deg); }
        }

        ._sp-ring {
          position: absolute;
          top: 50%; left: 50%;
          width: 84px; height: 84px;
          margin: -42px 0 0 -42px;
          border-radius: 50%;
          border: 1.4px solid currentColor;
          opacity: 0;
          z-index: 2;
          animation: _sp-ring ${TOTAL_MS}ms both;
          will-change: transform, opacity;
        }
        @keyframes _sp-ring {
          0%, 56%  { opacity: 0; transform: scale(1); }
          63%      { opacity: 0.55; transform: scale(1); }
          70%      { opacity: 0.30; transform: scale(2.4); }
          78%      { opacity: 0; transform: scale(3.5); }
          100%     { opacity: 0; transform: scale(3.5); }
        }

        ._sp-brand {
          position: absolute;
          bottom: max(env(safe-area-inset-bottom, 0px), 56px);
          left: 0; right: 0;
          text-align: center;
          font-family: 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, sans-serif;
          z-index: 3;
          animation: _sp-brand ${TOTAL_MS}ms both;
          will-change: transform, opacity;
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
        @keyframes _sp-brand {
          0%   { opacity: 0; transform: translateY(8px); }
          7%   { opacity: 1; transform: translateY(0); }
          70%  { opacity: 1; transform: translateY(0); }
          92%  { opacity: 1; transform: translateY(-2px) scale(1.15); }
          100% { opacity: 0; transform: translateY(-6px) scale(1.4); }
        }

        @media (prefers-reduced-motion: reduce) {
          ._sp-icon-wrap, ._sp-core, ._sp-sats, ._sp-ring, ._sp-brand, ._sp-bg {
            animation-duration: 0.01s !important;
          }
        }
      `}</style>
    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'

/*
 * AppSplash — senior-pass X-style intro.
 *
 * 1:1 port of .tmp-splash-preview.html. Total 2.4 s. Monochrome
 * ink per OS theme (black on white / white on black). Anticipation
 * wind-up → telegraphed ring pulse → parallax exit (satellites
 * whirl outward, core counter-rotates) → iris-open reveals the
 * page beneath, like a portal from the center dot.
 *
 * Timeline (percent of 2400 ms):
 *   0–8 %    entry overshoot scale 0.30 → 1.06
 *   8–60 %  breath ±1 %
 *   60–70 %  wind-up tighten to 0.92
 *   60–78 %  faint ring pulse telegraphs the climax
 *   70–100 % parent: scale → 14, rotate → +110°, opacity → 0 (last 8 %)
 *            satellites: stack +160° (~+270° net), scale → 1.75
 *            core: counter-rotate −40°, scale → 0.82
 *            splash bg: iris-hole (mask radial-gradient) 0 % → 160 %
 *            from icon's center → reveals page content behind
 *
 * Native handoff: capacitor.config.ts has launchAutoHide:false.
 * AppSplash calls SplashScreen.hide() with zero fade duration on
 * its first painted frame (rAF×2) so the native overlay dies
 * INTO an already-rendered AppSplash with matching icon — no
 * crossfade gap.
 */

const SESSION_KEY = 'hai_splash'
const TOTAL_MS = 2400
const HOLD_CEILING_MS = 8000

function alreadyShown() {
  try { return !!sessionStorage.getItem(SESSION_KEY) } catch { return false }
}

function deeplinkPending() {
  try { return sessionStorage.getItem('hai:deeplink-redirect') === '1' } catch { return false }
}

export default function AppSplash() {
  // Initial phase logic — fresh load OR active deeplink → play
  // splash. Otherwise (in-session navigation) → skip.
  const [phase, setPhase] = useState<'show' | 'gone'>(() => {
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

    if (phase === 'gone') {
      hideNativeSplash(250)
      return
    }

    // Wait two frames so AppSplash has painted before the native
    // overlay disappears. Zero-duration fade — AppSplash already
    // matches the native PNG so a crossfade isn't needed.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => hideNativeSplash(0))
    })

    let goneTimer: ReturnType<typeof setTimeout>
    let pollTimer: ReturnType<typeof setTimeout> | null = null

    function unmount() {
      setPhase('gone')
    }

    function tryStart() {
      const elapsed = Date.now() - mountTime.current
      if (elapsed >= HOLD_CEILING_MS) {
        try { sessionStorage.removeItem('hai:deeplink-redirect') } catch {}
        goneTimer = setTimeout(unmount, TOTAL_MS + 60)
        return
      }
      if (deeplinkPending()) {
        pollTimer = setTimeout(tryStart, 150)
        return
      }
      // Once load is in and no deeplink is pending, schedule the
      // unmount for the end of the 2.4 s animation. The CSS plays
      // automatically from mount.
      goneTimer = setTimeout(unmount, TOTAL_MS + 60)
    }

    if (document.readyState === 'complete') {
      tryStart()
    } else {
      window.addEventListener('load', tryStart, { once: true })
    }

    return () => {
      clearTimeout(goneTimer)
      if (pollTimer) clearTimeout(pollTimer)
      window.removeEventListener('load', tryStart)
    }
  }, [])

  if (phase === 'gone') return null

  return (
    <div className="_sp" aria-hidden="true">
      {/* Solid bg layer with a radial-gradient mask that grows a
          transparent hole from the icon's center at 70 %–100 % of
          the timeline. The hole reveals the page content beneath
          AppSplash (children of layout.tsx). */}
      <div className="_sp-bg" />

      {/* Faint pre-explosion ring (telegraphs the boom). */}
      <div className="_sp-ring" />

      <div className="_sp-icon-wrap">
        <svg className="_sp-icon" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
          {/* Core: square outline + inner rings + center dot.
              Exits SLOWER than satellites (scale 0.82 vs 1.75). */}
          <g className="_sp-core">
            <rect x="6" y="6" width="180" height="180" rx="40"
                  fill="none" stroke="currentColor" strokeWidth="12" />
            <circle cx="96" cy="96" r="73.5"
                    fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.2" />
            <circle cx="96" cy="96" r="57"
                    fill="none" stroke="currentColor" strokeOpacity="0.34" strokeWidth="1.6" />
            <circle cx="96" cy="96" r="19.5" fill="currentColor" />
          </g>
          {/* Satellites: exit FASTER than core (parallax depth). */}
          <g className="_sp-sats">
            <circle cx="96"    cy="39"    r="9.5" fill="currentColor" />
            <circle cx="145.5" cy="124.5" r="9.5" fill="currentColor" />
            <circle cx="46.5"  cy="124.5" r="9.5" fill="currentColor" />
          </g>
        </svg>
      </div>

      <div className="_sp-brand">
        <span className="_sp-ar">حَيّ</span>
        <span className="_sp-en">HAI</span>
      </div>

      <style jsx>{`
        /* @property registration so the radial-gradient mask can
           tween smoothly between keyframes. Supported on WKWebView
           since iOS 16.4 and Chrome 85; older WebViews will snap
           rather than tween (still functional, just less polished). */
        @property --iris-r {
          syntax: '<percentage>';
          inherits: false;
          initial-value: 0%;
        }

        ._sp {
          position: fixed;
          top: 0; right: 0; bottom: 0; left: 0;
          z-index: 9990;
          color: #0a0a0a;
          pointer-events: none;
        }
        :global(.dark) ._sp { color: #ffffff; }

        /* Solid bg + iris-hole mask. Once --iris-r exceeds the
           screen's half-diagonal (~120 %), the bg is fully
           transparent → page content behind AppSplash is visible. */
        ._sp-bg {
          position: absolute;
          inset: 0;
          background: #ffffff;
          z-index: 1;
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

        /* Faint ring telegraph — only visible during the wind-up. */
        ._sp-ring {
          position: absolute;
          top: 50%; left: 50%;
          width: 84px; height: 84px;
          margin: -42px 0 0 -42px;
          border-radius: 50%;
          border: 1.4px solid currentColor;
          opacity: 0;
          z-index: 4;
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

        /* Icon stage — sits ABOVE the iris bg so it stays visible
           as the iris opens beneath. */
        ._sp-icon-wrap {
          position: absolute;
          top: 50%; left: 50%;
          width: 84px; height: 84px;
          transform: translate(-50%, -50%);
          z-index: 5;
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
          100% { transform: translate(-50%, -50%) scale(14)   rotate(110deg); opacity: 0; filter: blur(5px); }
        }

        /* Satellites stack rotation+scale on top of the parent's
           transform. They whirl outward (+160°) while core
           counter-rotates (−40°) — gear-like depth. */
        ._sp-sats {
          animation: _sp-sats ${TOTAL_MS}ms both;
          transform-origin: 96px 96px;
        }
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

        ._sp-brand {
          position: absolute;
          bottom: max(env(safe-area-inset-bottom, 0px), 56px);
          left: 0; right: 0;
          text-align: center;
          font-family: 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, sans-serif;
          z-index: 5;
          animation: _sp-brand ${TOTAL_MS}ms both;
          will-change: transform, opacity;
        }
        ._sp-ar { font-size: 22px; font-weight: 700; display: block; line-height: 1; color: currentColor; }
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
          70%  { opacity: 1; transform: translateY(0); letter-spacing: 4px; }
          92%  { opacity: 1; transform: translateY(-2px) scale(1.15); letter-spacing: normal; }
          100% { opacity: 0; transform: translateY(-6px) scale(1.4); letter-spacing: normal; }
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

'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/*
 * AppSplash — root-level transparent transition overlay.
 *
 * ARCHITECTURE NOTE (do not move this component back into
 * layout.tsx's normal React tree):
 *
 *   The intro is intentionally semi-transparent — it should
 *   reveal the screen underneath during the smooth transition,
 *   not act as a solid cover. Because of that, layout matters
 *   more than for an opaque splash: any ancestor that creates
 *   a containing block for position:fixed (a transform, filter,
 *   will-change, contain:paint, etc.) would re-anchor this
 *   element to that ancestor's box and not the viewport. The
 *   visible result on pages with such ancestors (e.g. /feed
 *   wrapped by Next.js template.tsx during route transitions)
 *   is a misaligned/cropped splash even though the same JSX
 *   is rendered.
 *
 *   To make the mount bulletproof regardless of route layout,
 *   we render the splash through React.createPortal directly
 *   into document.body. This DETACHES the rendered DOM from
 *   the React tree so wrappers added by future auth/app layouts
 *   can never influence the splash's stacking context, size,
 *   or position. The component MUST stay a portal — see the
 *   exhaustive bug report on pre-auth vs post-auth misalignment.
 *
 * Visual goal:
 *   - Semi-transparent layer + backdrop-filter blur so the
 *     underlying page is visible BUT softened — feels like a
 *     pane sliding in front of the app, not a solid block.
 *   - Same icon choreography as .tmp-splash-preview.html
 *     (entry overshoot, breath, wind-up, parallax exit, ring
 *     pulse telegraph, brand release).
 *   - At the climax, blur clears and opacity drops together
 *     — the page sharpens into focus in one smooth beat.
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
  const [phase, setPhase] = useState<'show' | 'gone'>(() => {
    if (!alreadyShown()) return 'show'
    if (deeplinkPending()) return 'show'
    return 'gone'
  })
  const [mounted, setMounted] = useState(false)
  const mountTime = useRef(Date.now())

  // Portal target only exists client-side. Defer mount one tick
  // so document.body is guaranteed available and SSR doesn't try
  // to render the portal.
  useEffect(() => { setMounted(true) }, [])

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

    requestAnimationFrame(() => {
      requestAnimationFrame(() => hideNativeSplash(0))
    })

    let goneTimer: ReturnType<typeof setTimeout>
    let pollTimer: ReturnType<typeof setTimeout> | null = null

    function tryStart() {
      const elapsed = Date.now() - mountTime.current
      if (elapsed >= HOLD_CEILING_MS) {
        try { sessionStorage.removeItem('hai:deeplink-redirect') } catch {}
        goneTimer = setTimeout(() => setPhase('gone'), TOTAL_MS + 60)
        return
      }
      if (deeplinkPending()) {
        pollTimer = setTimeout(tryStart, 150)
        return
      }
      goneTimer = setTimeout(() => setPhase('gone'), TOTAL_MS + 60)
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

  if (!mounted || phase === 'gone') return null

  const overlay = (
    <div className="_sp" aria-hidden="true">
      {/* Semi-transparent bg with backdrop-filter blur. NOT a solid
          cover — the page underneath is visible but softened, which
          is what gives the transition its "pane sliding in" feel.
          During the climax (last 30 %), both the bg opacity and the
          backdrop blur reduce to zero, sharpening the page into
          focus. */}
      <div className="_sp-bg" />

      {/* Faint pre-explosion ring (telegraphs the climax). */}
      <div className="_sp-ring" />

      <div className="_sp-icon-wrap">
        <svg className="_sp-icon" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
          <g className="_sp-core">
            <rect x="6" y="6" width="180" height="180" rx="40"
                  fill="none" stroke="currentColor" strokeWidth="12" />
            <circle cx="96" cy="96" r="73.5"
                    fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.2" />
            <circle cx="96" cy="96" r="57"
                    fill="none" stroke="currentColor" strokeOpacity="0.34" strokeWidth="1.6" />
            <circle cx="96" cy="96" r="19.5" fill="currentColor" />
          </g>
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
        ._sp {
          /* StyleSheet.absoluteFillObject equivalent — top/right/
             bottom/left:0 explicitly so even old WebViews that
             mis-handle inset:0 still get full coverage. */
          position: fixed;
          top: 0; right: 0; bottom: 0; left: 0;
          width: 100vw;
          height: 100vh;
          z-index: 2147483647;        /* max signed-int z-index — beats any user-defined overlay */
          color: #0a0a0a;
          background: transparent;     /* must NOT be a solid color */
          pointer-events: auto;        /* swallow taps during the splash */
          /* No transform/filter/will-change here so the portal's
             child can never re-anchor its own position:fixed
             descendants in a weird way. Animation will-change
             lives on the actual animated children below. */
        }
        :global(.dark) ._sp { color: #ffffff; }

        /* Semi-transparent bg layer with backdrop blur.
           Animates from "softened pane" to "fully transparent"
           during the climax window. */
        ._sp-bg {
          position: absolute;
          inset: 0;
          background: rgba(255, 255, 255, 0.92);
          -webkit-backdrop-filter: blur(28px) saturate(1.05);
          backdrop-filter: blur(28px) saturate(1.05);
          z-index: 1;
          animation: _sp-bg ${TOTAL_MS}ms cubic-bezier(0.55, 0, 0.1, 1) both;
          will-change: opacity;
        }
        :global(.dark) ._sp-bg {
          background: rgba(0, 0, 0, 0.92);
        }
        @keyframes _sp-bg {
          0%, 78% { opacity: 1; }
          100%    { opacity: 0; }
        }

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
          0%, 56%  { opacity: 0; transform: translateZ(0) scale(1); }
          63%      { opacity: 0.55; transform: translateZ(0) scale(1); }
          70%      { opacity: 0.30; transform: translateZ(0) scale(2.4); }
          78%      { opacity: 0; transform: translateZ(0) scale(3.5); }
          100%     { opacity: 0; transform: translateZ(0) scale(3.5); }
        }

        ._sp-icon-wrap {
          position: absolute;
          top: 50%; left: 50%;
          width: 84px; height: 84px;
          margin: -42px 0 0 -42px;
          z-index: 5;
          will-change: transform, opacity;
          backface-visibility: hidden;
          animation: _sp-icon ${TOTAL_MS}ms both;
          animation-timing-function: linear;
        }
        ._sp-icon { width: 100%; height: 100%; display: block; }
        @keyframes _sp-icon {
          0%   { transform: translateZ(0) scale(0.30); opacity: 0; }
          4%   { transform: translateZ(0) scale(0.60); opacity: 1; }
          8%   { transform: translateZ(0) scale(1.06); }
          13%  { transform: translateZ(0) scale(1.00); }
          32%  { transform: translateZ(0) scale(1.012); }
          52%  { transform: translateZ(0) scale(0.998); }
          60%  { transform: translateZ(0) scale(1.00); }
          70%  { transform: translateZ(0) scale(0.92) rotate(0deg); }
          82%  { transform: translateZ(0) scale(2.20) rotate(32deg); }
          92%  { transform: translateZ(0) scale(7.50) rotate(80deg); opacity: 1; }
          100% { transform: translateZ(0) scale(14)   rotate(110deg); opacity: 0; }
        }

        ._sp-sats {
          animation: _sp-sats ${TOTAL_MS}ms both;
          transform-origin: 96px 96px;
          will-change: transform;
        }
        @keyframes _sp-sats {
          0%, 70%  { transform: translateZ(0) scale(1) rotate(0deg); }
          100%     { transform: translateZ(0) scale(1.75) rotate(160deg); }
        }
        ._sp-core {
          animation: _sp-core ${TOTAL_MS}ms both;
          transform-origin: 96px 96px;
          will-change: transform;
        }
        @keyframes _sp-core {
          0%, 70%  { transform: translateZ(0) scale(1) rotate(0deg); }
          100%     { transform: translateZ(0) scale(0.82) rotate(-40deg); }
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
          0%   { opacity: 0; transform: translate3d(0, 8px, 0) scale(1); }
          7%   { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
          70%  { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
          92%  { opacity: 1; transform: translate3d(0, -2px, 0) scale(1.15); }
          100% { opacity: 0; transform: translate3d(0, -6px, 0) scale(1.4); }
        }

        @media (prefers-reduced-motion: reduce) {
          ._sp-icon-wrap, ._sp-core, ._sp-sats, ._sp-ring, ._sp-brand, ._sp-bg {
            animation-duration: 0.01s !important;
          }
        }
      `}</style>
    </div>
  )

  // Portal mount target = document.body. This is the architectural
  // fix the bug report requested: the splash is no longer rendered
  // inside layout.tsx's React subtree (which includes Template's
  // hai-page-enter wrapper, LangProvider, NetworkProvider, etc.).
  // No ancestor in document.body can re-anchor our position:fixed,
  // so the visual must be identical pre-auth and post-auth.
  return createPortal(overlay, document.body)
}

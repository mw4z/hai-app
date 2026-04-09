'use client'

import { useState, useEffect, useRef } from 'react'

/*
 * AppSplash — "Community Signal" (refined)
 *
 * Center logo emits 2 soft pulse rings. 5 neighbor dots fade in around it,
 * connected to center by faint lines. Brand text appears below. Minimal,
 * calm, premium.
 *
 * Timeline:
 *   0.00s  background visible
 *   0.10s  logo scales in
 *   0.40s  pulse rings begin (1.8s loop, staggered)
 *   0.55s  first dot + line appears (stagger through 1.1s)
 *   0.90s  brand name fades up
 *   1.00s  wave loader fades in
 *   ≥0.80s dismiss when ready, hard cap 2.0s, 400ms fade-out
 *
 * Dismiss: minimum 800ms visible, then dismiss on next idle frame.
 *          Hard maximum 2000ms. Fade-out 400ms. Once per session.
 */

const SESSION_KEY = 'hai_splash'
const MIN_MS = 1800
const MAX_MS = 3000
const FADE_MS = 450

function alreadyShown() {
  try { return !!sessionStorage.getItem(SESSION_KEY) } catch { return false }
}

export default function AppSplash() {
  const [phase, setPhase] = useState<'show' | 'fade' | 'gone'>(() => alreadyShown() ? 'gone' : 'show')
  const dismissed = useRef(false)
  const mountTime = useRef(Date.now())

  useEffect(() => {
    const preload = document.getElementById('__hai_preload')
    const isNativePlatform = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform()

    if (phase === 'gone') {
      if (preload) preload.remove()
      if (isNativePlatform) {
        import('@capacitor/splash-screen').then(({ SplashScreen }) => {
          SplashScreen.hide({ fadeOutDuration: 0 })
        }).catch(() => {})
      }
      return
    }

    if (isNativePlatform) {
      // NATIVE: remove preload (it's behind native splash anyway).
      // Wait 2 frames for AppSplash CSS animations to initialize,
      // then fade native splash directly → reveals animated AppSplash.
      // Single transition, no intermediate layers.
      if (preload) preload.remove()
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          import('@capacitor/splash-screen').then(({ SplashScreen }) => {
            SplashScreen.hide({ fadeOutDuration: 400 })
          }).catch(() => {
            // If plugin fails, preload is already gone, AppSplash is visible
          })
        })
      })
    } else {
      // WEB: fade preload after AppSplash animations begin
      if (preload) {
        setTimeout(() => {
          preload.style.transition = 'opacity 200ms ease-out'
          preload.style.opacity = '0'
          setTimeout(() => preload.remove(), 220)
        }, 200)
      }
    }

    let maxTimer: ReturnType<typeof setTimeout>
    let fadeTimer: ReturnType<typeof setTimeout>

    function dismiss() {
      if (dismissed.current) return
      dismissed.current = true
      try { sessionStorage.setItem(SESSION_KEY, '1') } catch {}
      setPhase('fade')
      fadeTimer = setTimeout(() => setPhase('gone'), FADE_MS)
    }

    function tryDismiss() {
      const elapsed = Date.now() - mountTime.current
      if (elapsed >= MIN_MS) {
        dismiss()
      } else {
        setTimeout(dismiss, MIN_MS - elapsed)
      }
    }

    // Hard cap
    maxTimer = setTimeout(dismiss, MAX_MS)

    // Dismiss when ready (after min time)
    if (document.readyState === 'complete') {
      tryDismiss()
    } else {
      window.addEventListener('load', tryDismiss, { once: true })
    }

    return () => {
      clearTimeout(maxTimer)
      clearTimeout(fadeTimer)
      window.removeEventListener('load', tryDismiss)
    }
  }, [])

  if (phase === 'gone') return null

  return (
    <div className={`_sp ${phase === 'fade' ? '_sp-out' : ''}`} aria-hidden="true">

      {/* Background */}
      <div className="_sp-bg" />

      {/* Center composition */}
      <div className="_sp-stage">

        {/* Pulse rings — 2 only, very soft */}
        <div className="_sp-ring _sp-r1" />
        <div className="_sp-ring _sp-r2" />

        {/* Lines from center to each dot */}
        <svg className="_sp-svg" viewBox="-110 -110 220 220">
          {DOTS.map((d, i) => (
            <line
              key={i}
              x1="0" y1="0" x2={d.x} y2={d.y}
              className="_sp-ln"
              style={{ animationDelay: `${d.delay}s` }}
            />
          ))}
        </svg>

        {/* Neighbor dots */}
        {DOTS.map((d, i) => (
          <div
            key={i}
            className="_sp-dot"
            style={{
              '--x': d.x,
              '--y': d.y,
              '--d': `${d.delay}s`,
              '--s': `${d.size}px`,
            } as React.CSSProperties}
          />
        ))}

        {/* Logo */}
        <div className="_sp-logo">
          <svg viewBox="0 0 192 192" width="68" height="68">
            <rect width="192" height="192" rx="42" fill="#15803d"/>
            <circle cx="96" cy="106" r="17" fill="#fff"/>
            <circle cx="96" cy="51" r="11" fill="#fff"/>
            <circle cx="144" cy="134" r="11" fill="#fff"/>
            <circle cx="48" cy="134" r="11" fill="#fff"/>
          </svg>
        </div>
      </div>

      {/* Brand — Arabic dominant, English subordinate */}
      <div className="_sp-brand">
        <span className="_sp-ar">حَيّ</span>
        <span className="_sp-en">HAI</span>
      </div>

      {/* Loader dots */}
      <div className="_sp-ld">
        <i style={{ animationDelay: '0s' }} />
        <i style={{ animationDelay: '0.12s' }} />
        <i style={{ animationDelay: '0.24s' }} />
      </div>

      <style jsx>{`
        /* ── Root ──────────────────────────────────────────── */
        ._sp {
          position: fixed;
          inset: 0;
          z-index: 9990;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          opacity: 1;
          transform: scale(1);
          will-change: transform, opacity;
        }
        ._sp-out {
          animation: _spZoom ${FADE_MS}ms linear forwards;
          pointer-events: none;
        }
        @keyframes _spZoom {
          0%   { opacity: 1; transform: scale(1); }
          50%  { opacity: 1; transform: scale(1.5); }
          100% { opacity: 0; transform: scale(2); }
        }

        /* ── Background ───────────────────────────────────── */
        ._sp-bg {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 42%, #e8f5e9 0%, #f0fdf4 40%, #fff 100%);
        }
        :global(.dark) ._sp-bg {
          background: radial-gradient(ellipse at 50% 42%, #0d2818 0%, #0f1a14 40%, #0a0f0c 100%);
        }

        /* ── Stage ────────────────────────────────────────── */
        ._sp-stage {
          position: relative;
          width: 220px;
          height: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        /* ── Pulse rings (2, subtle) ──────────────────────── */
        ._sp-ring {
          position: absolute;
          border-radius: 50%;
          border: 1px solid #16a34a;
          opacity: 0;
          animation: _rp 1.8s ease-out infinite;
          will-change: transform, opacity;
        }
        :global(.dark) ._sp-ring { border-color: #22c55e; }

        ._sp-r1 { width: 100px; height: 100px; animation-delay: 0.4s; }
        ._sp-r2 { width: 180px; height: 180px; animation-delay: 0.7s; }

        @keyframes _rp {
          0%   { transform: scale(0.5); opacity: 0.35; }
          100% { transform: scale(1.2); opacity: 0; }
        }

        /* ── SVG lines (center→dot) ───────────────────────── */
        ._sp-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        ._sp-ln {
          stroke: #16a34a;
          stroke-width: 0.6;
          opacity: 0;
          animation: _ln 2s ease-in-out infinite;
          will-change: opacity;
        }
        :global(.dark) ._sp-ln { stroke: #4ade80; }

        @keyframes _ln {
          0%, 100% { opacity: 0; }
          30%, 70% { opacity: 0.12; }
        }

        /* ── Neighbor dots (5) ────────────────────────────── */
        ._sp-dot {
          position: absolute;
          width: var(--s);
          height: var(--s);
          border-radius: 50%;
          background: #16a34a;
          top: 50%;
          left: 50%;
          transform: translate(
            calc(-50% + var(--x) * 1px),
            calc(-50% + var(--y) * 1px)
          ) scale(0);
          opacity: 0;
          animation: _dot 2s ease-in-out infinite;
          animation-delay: var(--d);
          will-change: opacity, transform;
        }
        :global(.dark) ._sp-dot { background: #4ade80; }

        @keyframes _dot {
          0%, 100% {
            opacity: 0;
            transform: translate(calc(-50% + var(--x) * 1px), calc(-50% + var(--y) * 1px)) scale(0);
          }
          25%, 75% {
            opacity: 0.6;
            transform: translate(calc(-50% + var(--x) * 1px), calc(-50% + var(--y) * 1px)) scale(1);
          }
        }

        /* ── Logo ─────────────────────────────────────────── */
        ._sp-logo {
          position: relative;
          z-index: 2;
          width: 68px;
          height: 68px;
          border-radius: 15px;
          overflow: hidden;
          box-shadow: 0 6px 24px rgba(22, 163, 74, 0.3);
          animation: _logo 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
          will-change: transform, opacity;
        }
        ._sp-logo :global(svg) {
          display: block;
          width: 100%;
          height: 100%;
        }
        @keyframes _logo {
          from { opacity: 0; transform: scale(0.75); }
          to   { opacity: 1; transform: scale(1); }
        }

        /* ── Brand text ───────────────────────────────────── */
        ._sp-brand {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-top: 14px;
          animation: _brand 0.5s ease-out 0.9s both;
          will-change: opacity, transform;
        }
        ._sp-ar {
          font-family: 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 26px;
          font-weight: 700;
          color: #15803d;
          line-height: 1.6;
        }
        :global(.dark) ._sp-ar { color: #86efac; }

        ._sp-en {
          font-size: 10px;
          font-weight: 600;
          color: #9ca3af;
          letter-spacing: 3px;
          margin-top: 4px;
        }
        :global(.dark) ._sp-en { color: #6b7280; }

        @keyframes _brand {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Loader ───────────────────────────────────────── */
        ._sp-ld {
          position: absolute;
          bottom: max(env(safe-area-inset-bottom, 20px), 44px);
          display: flex;
          gap: 5px;
          animation: _ldIn 0.3s ease-out 1.0s both;
        }
        ._sp-ld i {
          display: block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #16a34a;
          animation: _wave 1s ease-in-out infinite;
          will-change: transform, opacity;
        }
        :global(.dark) ._sp-ld i { background: #4ade80; }

        @keyframes _wave {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
          40%            { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes _ldIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* ── Reduced motion ───────────────────────────────── */
        @media (prefers-reduced-motion: reduce) {
          ._sp-ring,
          ._sp-dot,
          ._sp-ln,
          ._sp-ld i {
            animation: none !important;
          }
          ._sp-ring  { opacity: 0.08; transform: scale(1); }
          ._sp-dot   { opacity: 0.45; transform: translate(calc(-50% + var(--x) * 1px), calc(-50% + var(--y) * 1px)) scale(1); }
          ._sp-ln    { opacity: 0.08; }
          ._sp-ld i  { opacity: 0.5; }
          ._sp-logo  { animation-duration: 0.01s !important; animation-delay: 0s !important; }
          ._sp-brand { animation-duration: 0.01s !important; animation-delay: 0s !important; }
          ._sp-ld    { animation-duration: 0.01s !important; animation-delay: 0s !important; }
        }
      `}</style>
    </div>
  )
}

// 5 dots, evenly spaced around center, within a ~90px radius
const DOTS = [
  { x:   0, y: -85, delay: 0.55, size: 6 },
  { x:  80, y: -28, delay: 0.67, size: 7 },
  { x:  50, y:  70, delay: 0.79, size: 5 },
  { x: -50, y:  70, delay: 0.91, size: 6 },
  { x: -80, y: -28, delay: 1.03, size: 7 },
]

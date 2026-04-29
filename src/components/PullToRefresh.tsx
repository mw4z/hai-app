'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { hapticMedium, hapticLight } from '@/lib/haptic'
import { isBodyScrollLocked } from '@/hooks/useBodyScrollLock'

const THRESHOLD = 80
const MAX_PULL = 130

/* Snapchat-style pull-to-refresh, Hai-branded.
 *
 * The visual is a FULL-WIDTH strip — not a floating circle. Snapchat's
 * pulldown turns the top of the screen into a brand-coloured chrome
 * block that GROWS in height as the user pulls; the indicator (their
 * bitmoji/ghost) lives inside that block. Hai's version mirrors that:
 * full-width teal strip just under the header, height = pull distance,
 * Hai 4-dot brand mark centered inside.
 *
 * Behaviour
 * ─────────
 *   - Rubber-band envelope on the pull (--hai-resistance-soft).
 *   - Strip height = pull distance (no fixed capsule).
 *   - Background colour darkens / saturates as progress 0→1.
 *   - At threshold the strip "arms": brighter teal, dots flip
 *     to white, soft glow ring appears.
 *   - Threshold haptic tick + medium haptic on commit.
 *   - Settle spring on release with a small overshoot bounce.
 *   - Centre dot pulses + orbital dots stagger while refreshing
 *     (matches HaiSpinner cadence).
 *
 * Position: anchored to JUST BELOW the page's sticky header (or the
 * safe-area on header-less screens). Detected at runtime via
 * ResizeObserver on the first .hai-app-shell > header.glass. The
 * strip slides down from the header bottom into the gap above the
 * list — never floats over the status bar.
 */
function motionToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}
function tokenNumber(name: string, fallback: number): number {
  const raw = motionToken(name, String(fallback))
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}
function reducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
}

export default function PullToRefresh() {
  const router = useRouter()
  const [pullY, setPullY] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [headerH, setHeaderH] = useState(0)
  const startY = useRef(0)
  const pulling = useRef(false)
  const hitThreshold = useRef(false)

  // Watch the page's sticky `.glass` header so the strip always parks
  // just below it. ResizeObserver on the first header element re-fires
  // when chip rows / banners / search bars expand the header chrome.
  useEffect(() => {
    if (typeof document === 'undefined') return
    let observer: ResizeObserver | null = null
    let target: HTMLElement | null = null
    function findAndObserve() {
      const next = document.querySelector<HTMLElement>('.hai-app-shell > header.glass')
        || document.querySelector<HTMLElement>('header.glass')
      if (next === target) return
      if (observer) observer.disconnect()
      target = next
      if (!target) { setHeaderH(0); return }
      setHeaderH(target.getBoundingClientRect().height)
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver((entries) => {
          for (const e of entries) setHeaderH(e.contentRect.height)
        })
        observer.observe(target)
      }
    }
    findAndObserve()
    const id = setInterval(findAndObserve, 500)
    return () => {
      clearInterval(id)
      if (observer) observer.disconnect()
    }
  }, [])

  useEffect(() => {
    function activeScroller(): HTMLElement | null {
      return document.querySelector<HTMLElement>('.hai-app-shell__scroll')
    }
    function atTop(): boolean {
      const inner = activeScroller()
      if (inner) return inner.scrollTop <= 0
      return window.scrollY <= 0
    }

    function onTouchStart(e: TouchEvent) {
      if (!atTop()) return
      if (document.querySelector('[data-overlay="true"]')) return
      if (isBodyScrollLocked()) return
      const path = window.location.pathname
      if (path !== '/feed' && path !== '/market' && path !== '/threads') return
      startY.current = e.touches[0].clientY
      pulling.current = true
      hitThreshold.current = false
    }

    function onTouchMove(e: TouchEvent) {
      if (!pulling.current || refreshing) return
      const delta = e.touches[0].clientY - startY.current
      if (delta <= 0) { setPullY(0); return }
      const resistance = tokenNumber('--hai-resistance-soft', 2.2)
      const clamped = Math.min(delta / resistance, MAX_PULL)
      setPullY(clamped)
      if (clamped >= THRESHOLD && !hitThreshold.current) {
        hitThreshold.current = true
        hapticLight()
      }
      if (clamped < THRESHOLD) hitThreshold.current = false
    }

    function onTouchEnd() {
      if (!pulling.current) return
      pulling.current = false
      if (pullY >= THRESHOLD) {
        hapticMedium()
        setRefreshing(true)
        setPullY(THRESHOLD)
        setTimeout(() => {
          router.refresh()
          setTimeout(() => { setRefreshing(false); setPullY(0) }, 600)
        }, 400)
      } else {
        setPullY(0)
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', onTouchEnd)
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [pullY, refreshing])

  if (pullY === 0 && !refreshing) return null

  const progress = Math.min(pullY / THRESHOLD, 1)
  const ready = pullY >= THRESHOLD || refreshing
  const isPulling = pulling.current

  // Strip height = the actual pull distance. While refreshing we hold
  // it at THRESHOLD so the dots have a stable canvas to animate on.
  const stripHeight = refreshing ? THRESHOLD : pullY

  // Backdrop colour blends from a translucent teal-tint into solid
  // primary-600 as progress climbs to 1. While armed/refreshing, hold
  // at full primary.
  const tintAlpha = 0.15 + Math.min(progress, 1) * 0.85
  // Inline gradient for a soft-glass look during the pull, hard fill
  // once armed.
  const stripBg = ready
    ? 'linear-gradient(to bottom, var(--hai-primary-600, #006d57), var(--hai-primary-500, #00a884))'
    : `linear-gradient(to bottom, rgba(0, 109, 87, ${tintAlpha}), rgba(0, 168, 132, ${Math.min(tintAlpha + 0.05, 1)}))`

  // Dots opacity scales with progress so the brand mark "fades in"
  // alongside the strip itself.
  const dotsOpacity = 0.5 + Math.min(progress, 1) * 0.5

  const settleSpring =
    `height ${motionToken('--hai-dur-slow', '260ms')} cubic-bezier(0.34, 1.56, 0.64, 1)`

  return (
    <div
      className="fixed left-0 right-0 z-50 pointer-events-none overflow-hidden"
      style={{
        // Park the strip just under the header bottom (or the safe-
        // area on screens with no sticky header).
        top: `calc(env(safe-area-inset-top, 0px) + ${headerH}px)`,
        height: stripHeight,
        background: stripBg,
        // Soft drop shadow under the strip while it's visible — gives
        // it a layered "chrome panel pulled out from behind the header"
        // look, matching Snapchat's depth.
        boxShadow: stripHeight > 0
          ? '0 6px 16px -4px rgba(0, 109, 87, 0.35)'
          : 'none',
        transition: isPulling || reducedMotion()
          ? 'background 200ms ease, box-shadow 200ms ease'
          : `${settleSpring}, background 200ms ease, box-shadow 200ms ease`,
      }}
    >
      {/* Hai 4-dot brand mark — centered both axes inside the strip.
          Stays a fixed size; it's the STRIP that grows, not the mark.
          That matches Snapchat — the bitmoji doesn't scale with the
          pull, it just rides the growing chrome. */}
      <div
        className="absolute left-0 right-0 flex justify-center"
        style={{
          // Vertically centre within the available strip height,
          // clamped so the mark never overflows when the strip is
          // smaller than the mark itself.
          top: Math.max(0, (stripHeight - 40) / 2),
          opacity: dotsOpacity,
          transition: 'top 80ms linear',
        }}
      >
        <svg
          viewBox="0 0 64 64"
          width={40}
          height={40}
          style={{
            filter: ready
              ? 'drop-shadow(0 0 6px rgba(255,255,255,0.5))'
              : 'none',
            transition: 'filter 200ms ease',
          }}
        >
          {/* Centre dot */}
          <circle cx="32" cy="35" r="6" fill="white">
            {refreshing && (
              <animate
                attributeName="opacity"
                values="1;0.35;1"
                dur="1.2s"
                repeatCount="indefinite"
              />
            )}
          </circle>
          {/* Top dot */}
          <circle cx="32" cy="15" r="4" fill="white">
            {refreshing && (
              <animate
                attributeName="opacity"
                values="0.4;1;0.4"
                dur="1.2s"
                begin="0s"
                repeatCount="indefinite"
              />
            )}
          </circle>
          {/* Lower-right */}
          <circle cx="48" cy="47" r="4" fill="white">
            {refreshing && (
              <animate
                attributeName="opacity"
                values="0.4;1;0.4"
                dur="1.2s"
                begin="0.4s"
                repeatCount="indefinite"
              />
            )}
          </circle>
          {/* Lower-left */}
          <circle cx="16" cy="47" r="4" fill="white">
            {refreshing && (
              <animate
                attributeName="opacity"
                values="0.4;1;0.4"
                dur="1.2s"
                begin="0.8s"
                repeatCount="indefinite"
              />
            )}
          </circle>
        </svg>
      </div>
    </div>
  )
}

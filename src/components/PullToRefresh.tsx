'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { hapticMedium, hapticLight } from '@/lib/haptic'
import { isBodyScrollLocked } from '@/hooks/useBodyScrollLock'

const THRESHOLD = 80
const MAX_PULL = 130

/* Snapchat-style pull-to-refresh, Hai-branded.
 *
 * Design notes carried over from the Snapchat reference:
 *   - Indicator EASES in (rubber-band envelope) — finger drags far,
 *     indicator drifts; the easing is the existing
 *     --hai-resistance-soft token from design-tokens.css.
 *   - Scale + opacity grow with pull progress (0..1) so the indicator
 *     "blooms" into existence rather than appearing fully formed.
 *   - Threshold trigger: at 100% pull the capsule inverts colours
 *     (becomes teal-filled, dots flip white) — clear visual signal
 *     "you've armed the refresh, you can let go now".
 *   - Haptic tick exactly at the threshold crossing.
 *   - Settle bounce on release: spring-back curve when the user lets
 *     go below threshold; commit-then-release animation when above.
 *   - NO generic spinner. Uses the 4-dot Hai pattern (matches the
 *     HaiLoader / app brand mark).
 *
 * Positioning: anchored to JUST BELOW the page's sticky header (or
 * below the safe-area on header-less screens). Detected at runtime
 * via ResizeObserver on the first .hai-app-shell > header.glass
 * element so the indicator floats in the gap between header bottom
 * and list top — not over the status bar / not behind the header.
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
  // Tracked header height (px) so the indicator parks just under it.
  const [headerH, setHeaderH] = useState(0)
  const startY = useRef(0)
  const pulling = useRef(false)
  const hitThreshold = useRef(false)

  // Watch the page's sticky `.glass` header, if any, and follow its
  // height. The shell layout puts the header outside the scroll, so
  // the indicator belongs in the gap right below it. Falls back to
  // 0 on screens without a shell — the indicator then floats below
  // the safe-area cover, the old position.
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
      if (!target) {
        setHeaderH(0)
        return
      }
      setHeaderH(target.getBoundingClientRect().height)
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver((entries) => {
          for (const e of entries) setHeaderH(e.contentRect.height)
        })
        observer.observe(target)
      }
    }

    findAndObserve()
    // Re-find on route changes (URL-bound, no need for router.events).
    const id = setInterval(findAndObserve, 500)
    return () => {
      clearInterval(id)
      if (observer) observer.disconnect()
    }
  }, [])

  useEffect(() => {
    function activeScroller(): HTMLElement | null {
      // On shell-using screens the scroll lives inside .hai-app-shell__scroll.
      const inner = document.querySelector<HTMLElement>('.hai-app-shell__scroll')
      return inner || null
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
      // Threshold haptic
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

  // Capsule transform — start hidden up behind the header and slide
  // down into view as the pull grows. translateY 0 = fully docked
  // just below the header bottom; negative = tucked back under the
  // header (used at rest before any pull).
  const indicatorH = 56
  // Anchor: header bottom = env(safe-area-inset-top) + headerH
  // Park position: indicator's centre lands just below that anchor.
  // We slide it down as pullY grows so it tracks the finger.
  const slideY = pullY - indicatorH * 0.6

  // Visual lerps for the "bloom" effect.
  const scale = 0.55 + Math.min(progress, 1) * 0.45     // 0.55 → 1.0
  const blurAmount = (1 - Math.min(progress, 1)) * 4     // 4px → 0
  const capsuleOpacity = 0.35 + Math.min(progress, 1) * 0.65 // 0.35 → 1
  const dotsOpacity = 0.45 + Math.min(progress, 1) * 0.55    // 0.45 → 1

  const settleSpring =
    `transform ${motionToken('--hai-dur-slow', '260ms')} cubic-bezier(0.34, 1.56, 0.64, 1), ` +
    `opacity 200ms ease`

  return (
    <div
      className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{
        // Anchor: just below the safe-area + the page's header.
        top: `calc(env(safe-area-inset-top, 0px) + ${headerH}px)`,
        transform: `translateY(${slideY}px)`,
        transition: isPulling || reducedMotion() ? 'none' : settleSpring,
      }}
    >
      <div
        className={`flex items-center justify-center rounded-full transition-colors duration-200 ${
          ready
            ? 'bg-primary-600 shadow-[0_8px_24px_-4px_rgba(0,109,87,0.5)]'
            : 'bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm shadow-lg'
        }`}
        style={{
          width: 64,
          height: 56,
          opacity: capsuleOpacity,
          transform: `scale(${scale})`,
          transformOrigin: 'center',
          // A subtle scale-into-view as the capsule blooms.
          transition: isPulling
            ? 'background-color 200ms ease, box-shadow 200ms ease'
            : `${settleSpring}, background-color 200ms ease, box-shadow 200ms ease`,
          filter: refreshing ? 'none' : `blur(${blurAmount}px)`,
        }}
      >
        {/* Hai 4-dot brand mark — same pattern as the HaiLoader /
            app launch icon. One large centre dot, three smaller dots
            arranged 120° apart (top, lower-right, lower-left). The
            three orbital dots animate in turn while refreshing,
            matching the existing HaiSpinner cadence. */}
        <svg
          viewBox="0 0 64 64"
          width={40}
          height={40}
          style={{ opacity: dotsOpacity }}
        >
          {/* Centre dot */}
          <circle
            cx="32"
            cy="35"
            r="6"
            fill={ready ? 'white' : 'var(--hai-primary-600, #006d57)'}
          >
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
          <circle
            cx="32"
            cy="15"
            r="4"
            fill={ready ? 'white' : 'var(--hai-primary-500, #00a884)'}
          >
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
          <circle
            cx="48"
            cy="47"
            r="4"
            fill={ready ? 'white' : 'var(--hai-primary-500, #00a884)'}
          >
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
          <circle
            cx="16"
            cy="47"
            r="4"
            fill={ready ? 'white' : 'var(--hai-primary-500, #00a884)'}
          >
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
          {/* Subtle ring at threshold to mark the "armed" state. */}
          {ready && !refreshing && (
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              stroke="white"
              strokeWidth="1"
              opacity="0.35"
              strokeDasharray="4 4"
            />
          )}
        </svg>
      </div>
    </div>
  )
}

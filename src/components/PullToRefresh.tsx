'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { hapticMedium, hapticLight } from '@/lib/haptic'
import { isBodyScrollLocked } from '@/hooks/useBodyScrollLock'

// Distance the finger must travel BEFORE anything visual happens.
// Soft / accidental pulls in this window do nothing — no strip, no
// haptic. Crossing it = the user is committed; we fire a haptic
// and reveal the strip starting from height 0.
const DEADZONE = 55
// Resistance applied to the strip AFTER the deadzone. 1 = strip
// tracks finger 1:1, >1 = rubber-band (strip lags behind finger).
// 1.4 keeps growth visible but the strip never out-runs the touch.
const STRIP_RESISTANCE = 1.4
// Pull (above the deadzone) needed to ARM the refresh. Releasing
// at or past this height commits; below it cancels back to 0.
// Strip itself can keep growing unboundedly past this — there is
// NO hard maximum, just the rubber-band resistance.
const ARM_HEIGHT = 50

/* Snapchat-style pull-to-refresh, Hai-branded.
 *
 * The previous implementation was a position:fixed strip that
 * OVERLAID the top of the list. That overlap never feels right —
 * pulling pushes the list visibly down on Snapchat / iOS native.
 *
 * This version portals the indicator INTO the active scroll
 * container as a real flow element with `height: pullY`. The
 * indicator pushes the list down by the same amount the user is
 * pulling, so there's no overlap with chip rows / search bars /
 * post cards — the gap that opens IS the indicator's space.
 *
 * Each shell page must render an empty `<div id="hai-pull-target" />`
 * as the first child of its `.hai-app-shell__scroll`; this component
 * renders the indicator into that element via createPortal.
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
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const startY = useRef(0)
  const pulling = useRef(false)
  const hitThreshold = useRef(false)

  // Re-locate the per-page pull target on every URL change. The
  // shell pages render `<div id="hai-pull-target" />` as the first
  // child of their .hai-app-shell__scroll; non-shell screens won't
  // have this and pull-to-refresh just stays disabled there.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const find = () => {
      const el = document.getElementById('hai-pull-target') as HTMLElement | null
      setTarget((prev) => (prev === el ? prev : el))
    }
    find()
    const id = setInterval(find, 500)
    return () => clearInterval(id)
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
      // Finger moving UP from the top — user is starting a normal
      // scroll-down gesture, not a pull. Release our claim on the
      // gesture so native scrolling (and bottom-edge rubber-band)
      // takes over without any preventDefault interference.
      if (delta <= 0) {
        pulling.current = false
        setPullY(0)
        hitThreshold.current = false
        return
      }
      // Finger moving DOWN at top — we ARE driving a pull from
      // here on. preventDefault() must fire on EVERY frame from now
      // (not just past the deadzone) — by the time we crossed the
      // deadzone, iOS had already committed to its native rubber-
      // band based on the first move, and the gray gap above our
      // indicator would already be locked in. Calling preventDefault
      // from frame 1 of a downward move at top is the only thing
      // that actually suppresses the WebView's bounce.
      if (e.cancelable) e.preventDefault()
      // Inside the deadzone — strip stays hidden, no haptic, but
      // the native bounce is still being suppressed (above).
      if (delta <= DEADZONE) {
        setPullY(0)
        hitThreshold.current = false
        return
      }
      // Crossed the deadzone for the first time → haptic fires
      // BEFORE any strip becomes visible.
      if (!hitThreshold.current) {
        hitThreshold.current = true
        hapticLight()
      }
      // Distance past the deadzone, scaled by rubber-band resistance.
      // No upper cap — strip keeps growing as long as the user keeps
      // pulling. Resistance just slows the growth so 600px finger
      // travel doesn't make a 600px strip.
      const above = (delta - DEADZONE) / STRIP_RESISTANCE
      setPullY(above)
    }

    function onTouchEnd() {
      if (!pulling.current) return
      pulling.current = false
      // Commit if the user pulled past ARM_HEIGHT. Anything less
      // (including the deadzone-only case where pullY stayed 0)
      // cancels back without refreshing.
      if (pullY >= ARM_HEIGHT) {
        hapticMedium()
        setRefreshing(true)
        setPullY(ARM_HEIGHT)
        setTimeout(() => {
          router.refresh()
          setTimeout(() => { setRefreshing(false); setPullY(0) }, 600)
        }, 400)
      } else {
        setPullY(0)
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    // touchmove is non-passive ONLY because we need preventDefault()
    // available for the active-pull case (suppresses the native
    // rubber-band so it doesn't stack with our portal indicator).
    // The handler bails out fast when not pulling, so the perf hit
    // outside of active pulls is negligible.
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [pullY, refreshing])

  if (!target) return null
  if (pullY === 0 && !refreshing) {
    // Render an empty container so target stays mounted; height 0
    // means it doesn't take any space.
    return createPortal(
      <div style={{ height: 0, overflow: 'hidden' }} />,
      target,
    )
  }

  // Progress drives the indicator's bloom — armed at >= ARM_HEIGHT.
  // Strip itself keeps growing past 1.0; we only use progress for
  // the visual confidence (mark scale / opacity / armed colour).
  const progress = Math.min(pullY / ARM_HEIGHT, 1)
  const ready = pullY >= ARM_HEIGHT || refreshing
  const isPulling = pulling.current
  // Strip height = the actual pull distance. While refreshing we
  // pin to ARM_HEIGHT so the dots have a stable canvas. Otherwise
  // the strip mirrors the user's pull with no upper bound.
  const height = refreshing ? ARM_HEIGHT : pullY

  // Indicator scale grows from 0.5 → 1 across the pull. The dots
  // sit centered at all times; they don't grow with the strip the
  // way the strip itself does — the strip GROWS, the mark just
  // becomes more confident as progress climbs.
  const markScale = 0.55 + progress * 0.45
  const markOpacity = 0.4 + progress * 0.6

  // Smooth springs only on RELEASE — during finger drag, height is
  // 1:1 with the touch.
  const springTransition = `height ${motionToken('--hai-dur-slow', '260ms')} cubic-bezier(0.34, 1.56, 0.64, 1)`

  return createPortal(
    <div
      aria-hidden="true"
      style={{
        height,
        overflow: 'hidden',
        position: 'relative',
        // Soft brand-tinted background that lives in the layout flow
        // — pushes the list below it down by `height`. Gradient blends
        // a translucent teal into the surface colour so it reads as a
        // brand-coloured chrome panel rather than a solid block.
        background: ready
          ? 'linear-gradient(to bottom, var(--hai-primary-600, #006d57), var(--hai-primary-500, #00a884))'
          : `linear-gradient(to bottom, rgba(0,109,87,${0.08 + progress * 0.45}), rgba(0,168,132,${0.04 + progress * 0.42}))`,
        transition: isPulling || reducedMotion()
          ? 'background 220ms ease'
          : `${springTransition}, background 220ms ease`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) scale(${markScale})`,
          opacity: markOpacity,
          transition: 'transform 120ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease',
          willChange: 'transform, opacity',
        }}
      >
        {/* Hai 4-dot brand mark */}
        <svg
          viewBox="0 0 64 64"
          width={36}
          height={36}
        >
          <circle cx="32" cy="35" r="6" fill={ready ? 'white' : 'var(--hai-primary-600, #006d57)'}>
            {refreshing && <animate attributeName="opacity" values="1;0.35;1" dur="1.2s" repeatCount="indefinite" />}
          </circle>
          <circle cx="32" cy="15" r="4" fill={ready ? 'white' : 'var(--hai-primary-500, #00a884)'}>
            {refreshing && <animate attributeName="opacity" values="0.4;1;0.4" dur="1.2s" begin="0s" repeatCount="indefinite" />}
          </circle>
          <circle cx="48" cy="47" r="4" fill={ready ? 'white' : 'var(--hai-primary-500, #00a884)'}>
            {refreshing && <animate attributeName="opacity" values="0.4;1;0.4" dur="1.2s" begin="0.4s" repeatCount="indefinite" />}
          </circle>
          <circle cx="16" cy="47" r="4" fill={ready ? 'white' : 'var(--hai-primary-500, #00a884)'}>
            {refreshing && <animate attributeName="opacity" values="0.4;1;0.4" dur="1.2s" begin="0.8s" repeatCount="indefinite" />}
          </circle>
        </svg>
      </div>
    </div>,
    target,
  )
}

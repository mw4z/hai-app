'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { hapticMedium, hapticLight } from '@/lib/haptic'
import { isBodyScrollLocked } from '@/hooks/useBodyScrollLock'

const THRESHOLD = 70
const MAX_PULL = 110

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

  if (!target) return null
  if (pullY === 0 && !refreshing) {
    // Render an empty container so target stays mounted; height 0
    // means it doesn't take any space.
    return createPortal(
      <div style={{ height: 0, overflow: 'hidden' }} />,
      target,
    )
  }

  const progress = Math.min(pullY / THRESHOLD, 1)
  const ready = pullY >= THRESHOLD || refreshing
  const isPulling = pulling.current
  const height = refreshing ? THRESHOLD : pullY

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

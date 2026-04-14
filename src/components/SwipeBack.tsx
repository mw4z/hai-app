'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi'
import { hapticLight, hapticMedium } from '@/lib/haptic'

/**
 * Edge swipe-to-go-back gesture.
 *
 * Touch starts within EDGE_THRESHOLD of the leading edge (left in LTR,
 * right in RTL). If the user drags more than GO_THRESHOLD horizontally,
 * we call router.back() on release.
 *
 * Bails out when:
 *  - Not a native platform (desktop browsers don't need this)
 *  - A modal overlay is open (same check as PullToRefresh)
 *  - We're on a root page where back would exit the app
 *  - The touch starts inside a horizontally scrollable container
 *  - A text input/textarea is focused (keyboard is up)
 */

const EDGE_THRESHOLD = 24      // px from edge where a touch starts qualifying
const GO_THRESHOLD = 90        // px horizontal drag to trigger back
const MAX_VERTICAL = 40        // px max vertical drift — bail if scrolling
const ROOT_PATHS = new Set([
  '/',
  '/feed',
  '/market',
  '/threads',
  '/profile',
])

export default function SwipeBack() {
  const router = useRouter()
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [triggered, setTriggered] = useState(false)

  const startX = useRef(0)
  const startY = useRef(0)
  const active = useRef(false)
  const isRTL = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    function canGoBack(): boolean {
      const path = window.location.pathname
      if (ROOT_PATHS.has(path)) return false
      // In-app navigation populates history, so length > 1 means we have
      // somewhere to go. window.history.length stays >= 2 even for fresh
      // loads in Capacitor (the embedded web view counts initial loads).
      // Be conservative and allow when not on a root page.
      return true
    }

    function isInOverlay(target: EventTarget | null): boolean {
      if (!(target instanceof Element)) return false
      // Respect the same modal guards as PullToRefresh
      if (document.querySelector('[data-overlay="true"]')) return true
      if (document.body.style.overflow === 'hidden') return true
      // Text input focus = keyboard open
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
      return false
    }

    function insideHorizontalScroller(target: EventTarget | null): boolean {
      if (!(target instanceof Element)) return false
      let el: Element | null = target
      while (el && el !== document.body) {
        const style = window.getComputedStyle(el)
        const ox = style.overflowX
        if (
          (ox === 'auto' || ox === 'scroll') &&
          (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth
        ) {
          return true
        }
        el = el.parentElement
      }
      return false
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return
      if (!canGoBack()) return
      if (isInOverlay(e.target)) return
      if (insideHorizontalScroller(e.target)) return

      const t = e.touches[0]
      isRTL.current = document.documentElement.getAttribute('dir') === 'rtl'

      // Edge detection depends on direction — in RTL the back gesture
      // starts from the right edge and drags left; in LTR it starts
      // from the left edge and drags right.
      const nearEdge = isRTL.current
        ? t.clientX > window.innerWidth - EDGE_THRESHOLD
        : t.clientX < EDGE_THRESHOLD
      if (!nearEdge) return

      startX.current = t.clientX
      startY.current = t.clientY
      active.current = true
      setDragX(0)
      setTriggered(false)
    }

    function onTouchMove(e: TouchEvent) {
      if (!active.current) return
      const t = e.touches[0]
      const dy = Math.abs(t.clientY - startY.current)
      if (dy > MAX_VERTICAL) {
        // Vertical scroll — cancel the swipe
        active.current = false
        setDragging(false)
        setDragX(0)
        return
      }
      // In RTL, drag is negative (right-to-left), flip the sign so the
      // indicator always grows in the "direction of progress".
      const rawDx = t.clientX - startX.current
      const dx = isRTL.current ? -rawDx : rawDx
      if (dx < 0) {
        // Dragging the wrong way — ignore, don't let it negative-peek
        return
      }
      // Stop the page from scrolling horizontally while we drag
      if (dx > 8) e.preventDefault()
      setDragging(true)
      setDragX(dx)
      const crossedThreshold = dx >= GO_THRESHOLD
      if (crossedThreshold && !triggered) {
        setTriggered(true)
        hapticLight()
      } else if (!crossedThreshold && triggered) {
        setTriggered(false)
      }
    }

    function onTouchEnd() {
      if (!active.current) return
      active.current = false
      const shouldGo = dragX >= GO_THRESHOLD
      setDragging(false)
      setDragX(0)
      setTriggered(false)
      if (shouldGo) {
        hapticMedium()
        // Tiny delay so the release animation is visible before navigating
        setTimeout(() => router.back(), 30)
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    document.addEventListener('touchcancel', onTouchEnd)
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [router, dragX, triggered])

  if (!dragging || dragX === 0) return null

  // Visual indicator — a pill that grows from the edge and fills when
  // threshold is reached. Position: leading edge (left in LTR, right in RTL).
  const progress = Math.min(dragX / GO_THRESHOLD, 1)
  const scale = 0.7 + progress * 0.5
  const ready = dragX >= GO_THRESHOLD

  return (
    <div
      className="pointer-events-none fixed top-1/2 -translate-y-1/2 z-[80]"
      style={
        isRTL.current
          ? { right: 0, transform: `translate(${-dragX * 0.3}px, -50%)` }
          : { left: 0, transform: `translate(${dragX * 0.3}px, -50%)` }
      }
    >
      <div
        className={`flex items-center justify-center rounded-full shadow-lg transition-colors duration-150 ${
          ready
            ? 'bg-primary-600 text-white'
            : 'bg-white/90 dark:bg-gray-800/90 text-gray-500 dark:text-gray-300'
        }`}
        style={{
          width: 44,
          height: 44,
          transform: `scale(${scale})`,
          transition: 'transform 0.1s, background-color 0.15s',
        }}
      >
        {isRTL.current ? (
          <FiArrowRight className="w-5 h-5" />
        ) : (
          <FiArrowLeft className="w-5 h-5" />
        )}
      </div>
    </div>
  )
}

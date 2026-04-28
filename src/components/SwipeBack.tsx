'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { hapticLight, hapticMedium } from '@/lib/haptic'
import { isBodyScrollLocked } from '@/hooks/useBodyScrollLock'

/**
 * Edge swipe-to-go-back gesture. Invisible — no visual indicator.
 *
 * Touch starts within EDGE_THRESHOLD of the leading edge (left in LTR,
 * right in RTL). If the user drags more than GO_THRESHOLD horizontally,
 * we call router.back() on release.
 *
 * Bails out when:
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

  // All state lives in refs — no re-renders during the gesture.
  const startX = useRef(0)
  const startY = useRef(0)
  const currentDx = useRef(0)
  const active = useRef(false)
  const triggered = useRef(false)
  const isRTL = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    function canGoBack(): boolean {
      const path = window.location.pathname
      if (ROOT_PATHS.has(path)) return false
      return true
    }

    function isInOverlay(): boolean {
      if (document.querySelector('[data-overlay="true"]')) return true
      // useBodyScrollLock no longer sets body.style.overflow; check
      // its module-level ref count via the helper instead.
      if (isBodyScrollLocked()) return true
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
      if (isInOverlay()) return
      if (insideHorizontalScroller(e.target)) return

      const t = e.touches[0]
      isRTL.current = document.documentElement.getAttribute('dir') === 'rtl'

      const nearEdge = isRTL.current
        ? t.clientX > window.innerWidth - EDGE_THRESHOLD
        : t.clientX < EDGE_THRESHOLD
      if (!nearEdge) return

      startX.current = t.clientX
      startY.current = t.clientY
      currentDx.current = 0
      active.current = true
      triggered.current = false
    }

    function onTouchMove(e: TouchEvent) {
      if (!active.current) return
      const t = e.touches[0]
      const dy = Math.abs(t.clientY - startY.current)
      if (dy > MAX_VERTICAL) {
        // Vertical scroll — cancel the swipe
        active.current = false
        currentDx.current = 0
        return
      }
      // In RTL, drag is negative (right-to-left), flip the sign so progress
      // is always positive.
      const rawDx = t.clientX - startX.current
      const dx = isRTL.current ? -rawDx : rawDx
      if (dx < 0) return
      if (dx > 8) e.preventDefault()
      currentDx.current = dx
      const crossedThreshold = dx >= GO_THRESHOLD
      if (crossedThreshold && !triggered.current) {
        triggered.current = true
        hapticLight()
      } else if (!crossedThreshold && triggered.current) {
        triggered.current = false
      }
    }

    function onTouchEnd() {
      if (!active.current) return
      active.current = false
      const shouldGo = currentDx.current >= GO_THRESHOLD
      currentDx.current = 0
      triggered.current = false
      if (shouldGo) {
        hapticMedium()
        router.back()
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
  }, [router])

  return null
}

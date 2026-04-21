'use client'

import { useEffect } from 'react'

/**
 * JS rubber-band for the whole-page scroller.
 *
 * Why not pure CSS? `overscroll-behavior` tells the browser to allow
 * bouncing but doesn't actually implement it. iOS WKWebView has
 * elastic bounce natively, but it's inconsistent across versions,
 * and Android WebView has no elastic bounce at all — at best it
 * shows a "glow" effect. This component produces the elastic stretch
 * ourselves so behavior is identical on every platform.
 *
 * Behavior:
 *  - At scrollY === 0, a finger drag DOWN translates the body with
 *    rubber-band resistance (delta / 2.5). Release → spring back.
 *  - At scrollY === max, a finger drag UP translates the body upward
 *    with the same resistance. Release → spring back.
 *  - Does nothing while anywhere else in the scroll range, while an
 *    overlay (sheet/modal) is open, while an input/textarea is
 *    focused, or while a touch starts inside a horizontally
 *    scrollable element.
 *
 * Coexists with PullToRefresh: if PTR is active on the current route
 * (feed/market/threads), it consumes downward pulls at the top with
 * its own handler. This component's onTouchStart short-circuits when
 * PTR is pulling by checking for the ongoing transform marker.
 */

const RESISTANCE = 2.5
const SPRING_MS = 260

export default function RubberBand() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    // Only do this on touch devices.
    if (!('ontouchstart' in window)) return

    let startY = 0
    let dragging = false
    let edge: 'top' | 'bottom' | null = null
    let raf = 0

    const getScrollY = () => window.scrollY || document.documentElement.scrollTop || 0
    const getMaxScroll = () =>
      Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        document.body.scrollHeight - window.innerHeight,
        0,
      )

    const applyTransform = (dy: number) => {
      document.body.style.transform = dy === 0 ? '' : `translate3d(0, ${dy}px, 0)`
    }

    const springBack = () => {
      document.body.style.transition = `transform ${SPRING_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
      applyTransform(0)
      const done = () => {
        document.body.style.transition = ''
        document.body.style.transform = ''
        document.body.removeEventListener('transitionend', done)
      }
      document.body.addEventListener('transitionend', done)
    }

    const isBlocked = (target: EventTarget | null): boolean => {
      // An open sheet/modal manages its own gestures.
      if (document.querySelector('[data-overlay="true"]')) return true
      if (document.body.style.overflow === 'hidden') return true
      const activeTag = (document.activeElement?.tagName || '').toLowerCase()
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return true
      // Don't trigger inside horizontal scrollers (carousels etc).
      let el: Element | null = target instanceof Element ? target : null
      while (el && el !== document.body) {
        const s = window.getComputedStyle(el)
        if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth) return true
        // Touches that start inside an internal vertical scroller are
        // that scroller's problem — CSS overscroll-behavior on it will
        // handle it. Don't rubber-band the page from inside.
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return true
        el = el.parentElement
      }
      return false
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      if (isBlocked(e.target)) return
      const y = e.touches[0].clientY
      const sy = getScrollY()
      const max = getMaxScroll()
      if (sy <= 0) {
        edge = 'top'
      } else if (sy >= max - 0.5) {
        edge = 'bottom'
      } else {
        edge = null
        return
      }
      dragging = true
      startY = y
      document.body.style.transition = ''
    }

    const onMove = (e: TouchEvent) => {
      if (!dragging || !edge) return
      const y = e.touches[0].clientY
      const raw = y - startY
      let dy = 0
      if (edge === 'top' && raw > 0) {
        dy = raw / RESISTANCE
      } else if (edge === 'bottom' && raw < 0) {
        dy = raw / RESISTANCE
      } else {
        // User reversed past the edge — end the drag.
        dragging = false
        edge = null
        springBack()
        return
      }
      if (Math.abs(raw) > 6) e.preventDefault()
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => applyTransform(dy))
    }

    const onEnd = () => {
      if (!dragging) return
      dragging = false
      edge = null
      cancelAnimationFrame(raf)
      springBack()
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
      cancelAnimationFrame(raf)
    }
  }, [])

  return null
}

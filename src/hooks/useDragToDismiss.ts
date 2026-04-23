'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * Attach drag-to-dismiss with iOS-style elastic spring to a bottom
 * sheet. Returns a ref to spread on the sheet's root element and a
 * ref for the drag-handle area (header / grab bar) — only touches
 * that start on the handle trigger the drag, so the sheet's own
 * scroll lists stay interactive.
 *
 *  - Downward drag tracks the finger 1:1 until release.
 *  - Upward drag has rubber-band resistance (delta / 3) so the sheet
 *    stretches slightly but never climbs above its opened position.
 *  - On release: past DISMISS_THRESHOLD or with enough downward
 *    velocity → onDismiss(). Otherwise springs back to translateY: 0.
 */

const DISMISS_THRESHOLD = 120 // px
const VELOCITY_THRESHOLD = 0.6 // px/ms

/** Shared motion values, read from design-tokens.css so the hook
 *  tracks the app-wide calibration. Falls back to sensible defaults
 *  if the page has no `.dark` / `:root` styles yet. */
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

interface Opts {
  open: boolean
  onDismiss: () => void
}

export function useDragToDismiss<T extends HTMLElement, H extends HTMLElement>({ open, onDismiss }: Opts) {
  const sheetRef = useRef<T | null>(null)
  const handleRef = useRef<H | null>(null)

  const startY = useRef(0)
  const lastY = useRef(0)
  const lastT = useRef(0)
  const velocity = useRef(0)
  const dragging = useRef(false)

  const setTransform = useCallback((y: number) => {
    const el = sheetRef.current
    if (!el) return
    el.style.transform = `translateY(${y}px)`
  }, [])

  const springBack = useCallback(() => {
    const el = sheetRef.current
    if (!el) return
    const dur = reducedMotion() ? '0ms' : motionToken('--hai-dur-slow', '260ms')
    const ease = motionToken('--hai-ease-standard', 'cubic-bezier(0.22, 1, 0.36, 1)')
    el.style.transition = `transform ${dur} ${ease}`
    el.style.transform = 'translateY(0px)'
    const done = () => {
      el.style.transition = ''
      el.removeEventListener('transitionend', done)
    }
    el.addEventListener('transitionend', done)
  }, [])

  useEffect(() => {
    if (!open) return
    const handle = handleRef.current
    const sheet = sheetRef.current
    if (!handle || !sheet) return

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      dragging.current = true
      startY.current = e.touches[0].clientY
      lastY.current = startY.current
      lastT.current = performance.now()
      velocity.current = 0
      sheet.style.transition = ''
    }

    const onMove = (e: TouchEvent) => {
      if (!dragging.current) return
      const y = e.touches[0].clientY
      const now = performance.now()
      const dt = Math.max(1, now - lastT.current)
      velocity.current = (y - lastY.current) / dt
      lastY.current = y
      lastT.current = now

      const rawDelta = y - startY.current
      // Rubber-band the upward drag — the sheet can stretch a little
      // but never leaves the screen upward. Divisor comes from the
      // shared --hai-resistance-standard token so all drag surfaces
      // share the same elastic character.
      const resistance = tokenNumber('--hai-resistance-standard', 3)
      const delta = rawDelta >= 0 ? rawDelta : rawDelta / resistance
      setTransform(delta)
      if (rawDelta > 6) e.preventDefault()
    }

    const onEnd = () => {
      if (!dragging.current) return
      dragging.current = false
      const travelled = lastY.current - startY.current
      const flungDown = velocity.current > VELOCITY_THRESHOLD
      if (travelled > DISMISS_THRESHOLD || flungDown) {
        // Animate out then dismiss so the close feels continuous.
        const el = sheetRef.current
        if (el) {
          const dur = reducedMotion() ? '0ms' : motionToken('--hai-dur-normal', '180ms')
          const ease = motionToken('--hai-ease-exit', 'cubic-bezier(0.4, 0, 1, 1)')
          el.style.transition = `transform ${dur} ${ease}`
          el.style.transform = `translateY(${el.offsetHeight}px)`
        }
        setTimeout(onDismiss, reducedMotion() ? 0 : 180)
      } else {
        springBack()
      }
    }

    handle.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)
    return () => {
      handle.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [open, onDismiss, setTransform, springBack])

  return { sheetRef, handleRef }
}

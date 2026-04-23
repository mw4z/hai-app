'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { FiX, FiDownload } from 'react-icons/fi'
import { hapticLight } from '@/lib/haptic'
import { saveImageToDevice } from '@/lib/saveImage'
import { useLanguage } from '@/hooks/useLanguage'

interface Props {
  images: string[]
  initialIndex: number
  open: boolean
  onClose: () => void
}

// ── Gesture thresholds ─────────────────────────────────────────────────
const H_SWIPE_PX = 60          // minimum horizontal travel to switch image
const H_SWIPE_VEL = 0.4        // px/ms — above this, commit even on small travel
const V_DISMISS_PX = 130       // minimum vertical travel to dismiss
const V_DISMISS_VEL = 0.7      // px/ms — "flick down to close"
const DIR_LOCK_PX = 8          // pixels before we commit to horizontal/vertical
const MAX_ZOOM = 5

/** Read the shared motion tokens (design-tokens.css) so the lightbox's
 *  snap / zoom springs match sheet and pull-to-refresh calibration.
 *  Falls back to the legacy hand-tuned values if the tokens haven't
 *  loaded yet (first paint before CSS is ready). */
function motionToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
}
// Computed at call-site so SSR never touches window and prefers-reduced-motion
// can shorten / disable the spring at event time.
const SPRING = (): string => {
  if (prefersReducedMotion()) return 'transform 0ms linear'
  const dur = motionToken('--hai-dur-xslow', '420ms')
  const ease = motionToken('--hai-ease-standard', 'cubic-bezier(0.22, 1, 0.36, 1)')
  return `transform ${dur} ${ease}`
}
const ZOOM_SPRING = (): string => {
  if (prefersReducedMotion()) return 'transform 0ms linear'
  const dur = motionToken('--hai-dur-slow', '260ms')
  const ease = motionToken('--hai-ease-standard', 'cubic-bezier(0.22, 1, 0.36, 1)')
  return `transform ${dur} ${ease}`
}

/**
 * Premium fullscreen image viewer.
 *
 *  - Opens with a fade + subtle scale-in
 *  - Horizontal swipe between images (momentum, rubber-band at edges)
 *  - Vertical drag to dismiss (progressive backdrop fade + image scale)
 *  - Pinch-to-zoom + pan, double-tap to toggle zoom, max 5×
 *  - Animated pill-dots indicator + safe-area aware chrome
 *  - Haptic tick on page change, medium on dismiss
 */
export default function ImageLightbox({
  images,
  initialIndex,
  open,
  onClose,
}: Props) {
  const { lang } = useLanguage()
  const isRTL = lang !== 'en'
  const [index, setIndex] = useState(initialIndex)
  // trackIdx maps real image index → physical track position. In RTL,
  // images are reordered via CSS `order` so img[0] is on the right.
  const trackIdx = isRTL ? images.length - 1 - index : index
  const [mounted, setMounted] = useState(open)
  const [entered, setEntered] = useState(false)

  const trackRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const imgWrapRefs = useRef<(HTMLDivElement | null)[]>([])

  // Gesture state lives in refs so touchmove doesn't re-render.
  const gestureRef = useRef<{
    startX: number
    startY: number
    startT: number
    lastX: number
    lastY: number
    lastT: number
    mode: null | 'h' | 'v' | 'pinch' | 'pan'
  } | null>(null)
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null)
  const zoomRef = useRef({ scale: 1, tx: 0, ty: 0 })
  const lastTapRef = useRef(0)

  // ── Mount / unmount with enter animation ─────────────────────────────
  useEffect(() => {
    if (open) {
      setMounted(true)
      setIndex(initialIndex)
      zoomRef.current = { scale: 1, tx: 0, ty: 0 }
      // Two rAFs guarantee the initial styles are committed before we
      // flip `entered` to true, otherwise the transition wouldn't play.
      const id1 = requestAnimationFrame(() => {
        const id2 = requestAnimationFrame(() => setEntered(true))
        ;(id1 as any)._next = id2
      })
      return () => cancelAnimationFrame(id1)
    } else if (mounted) {
      setEntered(false)
      const t = setTimeout(() => setMounted(false), 260)
      return () => clearTimeout(t)
    }
  }, [open, initialIndex])

  // ── Body scroll lock while open ──────────────────────────────────────
  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mounted])

  // ── Keyboard: Esc to close, arrows to navigate ───────────────────────
  useEffect(() => {
    if (!mounted) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(images.length - 1, i + 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, onClose, images.length])

  // ── Snap track to current index after index changes ─────────────────
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const vw = window.innerWidth
    track.style.transition = SPRING()
    track.style.transform = `translate3d(${-trackIdx * vw}px, 0, 0)`

    // Reset zoom state of the newly-active image
    zoomRef.current = { scale: 1, tx: 0, ty: 0 }
    const wrap = imgWrapRefs.current[index]
    if (wrap) {
      wrap.style.transition = ZOOM_SPRING()
      wrap.style.transform = 'translate3d(0, 0, 0) scale(1)'
    }
  }, [index, trackIdx])

  const getActiveWrap = () => imgWrapRefs.current[index]

  function applyImgTransform(tx: number, ty: number, scale: number) {
    const wrap = getActiveWrap()
    if (!wrap) return
    wrap.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`
  }

  // Mutable refs so the native listeners (attached once per open) can
  // read the current values without being re-registered on every render.
  const trackIdxRef = useRef(trackIdx)
  const imagesLenRef = useRef(images.length)
  const onCloseRef = useRef(onClose)
  const isRTLRef = useRef(isRTL)
  useEffect(() => { trackIdxRef.current = trackIdx }, [trackIdx])
  useEffect(() => { imagesLenRef.current = images.length }, [images.length])
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => { isRTLRef.current = isRTL }, [isRTL])

  // ── Native touch handlers (non-passive) ─────────────────────────────
  // React's synthetic touch events are passive — preventDefault() is
  // silently ignored and the browser races us for the gesture. On iOS
  // WKWebView the browser wins: it cancels touchmove delivery entirely
  // after the first few events, so the track never moves. We attach
  // listeners directly with { passive: false } so preventDefault works
  // and we fully own the gesture.
  useEffect(() => {
    if (!mounted) return
    const track = trackRef.current
    if (!track) return

    function handleTouchStart(e: TouchEvent) {
      const touches = e.touches
      const now = Date.now()

      if (touches.length === 2) {
        const dx = touches[0].clientX - touches[1].clientX
        const dy = touches[0].clientY - touches[1].clientY
        pinchRef.current = {
          startDist: Math.hypot(dx, dy),
          startScale: zoomRef.current.scale,
        }
        gestureRef.current = {
          startX: 0, startY: 0, startT: now,
          lastX: 0, lastY: 0, lastT: now,
          mode: 'pinch',
        }
        return
      }

      if (touches.length !== 1) return
      const t = touches[0]
      gestureRef.current = {
        startX: t.clientX, startY: t.clientY, startT: now,
        lastX: t.clientX, lastY: t.clientY, lastT: now,
        mode: zoomRef.current.scale > 1.05 ? 'pan' : null,
      }
      if (trackRef.current) trackRef.current.style.transition = 'none'
      const realIdx = isRTLRef.current ? imagesLenRef.current - 1 - trackIdxRef.current : trackIdxRef.current
      const wrap = imgWrapRefs.current[realIdx]
      if (wrap) wrap.style.transition = 'none'
    }

    function handleTouchMove(e: TouchEvent) {
      const g = gestureRef.current
      if (!g) return
      const touches = e.touches

      // Pinch
      if (g.mode === 'pinch' && touches.length === 2 && pinchRef.current) {
        e.preventDefault()
        const dx = touches[0].clientX - touches[1].clientX
        const dy = touches[0].clientY - touches[1].clientY
        const dist = Math.hypot(dx, dy)
        let scale = (dist / pinchRef.current.startDist) * pinchRef.current.startScale
        scale = Math.max(1, Math.min(MAX_ZOOM, scale))
        zoomRef.current.scale = scale
        applyImgTransform(zoomRef.current.tx, zoomRef.current.ty, scale)
        return
      }

      if (touches.length !== 1) return
      const t = touches[0]
      const dx = t.clientX - g.startX
      const dy = t.clientY - g.startY
      const tIdx = trackIdxRef.current
      const lenm1 = imagesLenRef.current - 1

      // Pan when zoomed
      if (g.mode === 'pan') {
        e.preventDefault()
        const ddx = t.clientX - g.lastX
        const ddy = t.clientY - g.lastY
        zoomRef.current.tx += ddx
        zoomRef.current.ty += ddy
        applyImgTransform(zoomRef.current.tx, zoomRef.current.ty, zoomRef.current.scale)
        g.lastX = t.clientX
        g.lastY = t.clientY
        g.lastT = Date.now()
        return
      }

      // Direction lock
      if (g.mode === null && (Math.abs(dx) > DIR_LOCK_PX || Math.abs(dy) > DIR_LOCK_PX)) {
        g.mode = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      }

      if (g.mode === 'h') {
        e.preventDefault()
        let offset = dx
        // Rubber band at physical track edges — divisor comes from
        // the shared --hai-resistance-standard token so the lightbox
        // track, bottom sheets, and onboarding all yield identically
        // when dragged past their limits.
        if ((tIdx === 0 && dx > 0) || (tIdx === lenm1 && dx < 0)) {
          const resistance = parseFloat(
            getComputedStyle(document.documentElement)
              .getPropertyValue('--hai-resistance-standard').trim(),
          ) || 3
          offset = dx / resistance
        }
        if (trackRef.current) {
          const vw = window.innerWidth
          trackRef.current.style.transform =
            `translate3d(${-tIdx * vw + offset}px, 0, 0)`
        }
      } else if (g.mode === 'v') {
        e.preventDefault()
        const abs = Math.abs(dy)
        const scale = Math.max(0.82, 1 - abs / 1200)
        applyImgTransform(0, dy, scale)
        if (backdropRef.current) {
          const opacity = Math.max(0.3, 1 - abs / 520)
          backdropRef.current.style.transition = 'none'
          backdropRef.current.style.opacity = String(opacity)
        }
      }

      g.lastX = t.clientX
      g.lastY = t.clientY
      g.lastT = Date.now()
    }

    function handleTouchEnd() {
      const g = gestureRef.current
      if (!g) return

      const totalDx = g.lastX - g.startX
      const totalDy = g.lastY - g.startY
      const dt = Math.max(1, g.lastT - g.startT)
      const velX = totalDx / dt
      const velY = totalDy / dt
      const tIdx = trackIdxRef.current
      const len = imagesLenRef.current
      const lenm1 = len - 1
      const rtl = isRTLRef.current

      if (g.mode === 'h') {
        // Work in track space — swipe left = trackIdx+1, right = trackIdx-1
        let nextTIdx = tIdx
        if (totalDx < -H_SWIPE_PX || velX < -H_SWIPE_VEL) {
          nextTIdx = Math.min(lenm1, tIdx + 1)
        } else if (totalDx > H_SWIPE_PX || velX > H_SWIPE_VEL) {
          nextTIdx = Math.max(0, tIdx - 1)
        }
        if (trackRef.current) {
          trackRef.current.style.transition = SPRING()
          const vw = window.innerWidth
          trackRef.current.style.transform = `translate3d(${-nextTIdx * vw}px, 0, 0)`
        }
        // Convert track position back to real image index
        const nextReal = rtl ? len - 1 - nextTIdx : nextTIdx
        const curReal = rtl ? len - 1 - tIdx : tIdx
        if (nextReal !== curReal) {
          hapticLight()
          setIndex(nextReal)
        }
      } else if (g.mode === 'v') {
        const shouldDismiss = totalDy > V_DISMISS_PX || velY > V_DISMISS_VEL
        if (shouldDismiss) {
          onCloseRef.current()
        } else {
          const realIdx = rtl ? len - 1 - tIdx : tIdx
          const wrap = imgWrapRefs.current[realIdx]
          if (wrap) {
            wrap.style.transition = ZOOM_SPRING()
            wrap.style.transform = 'translate3d(0, 0, 0) scale(1)'
          }
          if (backdropRef.current) {
            const bdDur = prefersReducedMotion()
              ? '0ms'
              : motionToken('--hai-dur-slow', '260ms')
            backdropRef.current.style.transition = `opacity ${bdDur} ease-out`
            backdropRef.current.style.opacity = '1'
          }
        }
      } else if (g.mode === 'pinch') {
        if (zoomRef.current.scale <= 1.02) {
          zoomRef.current = { scale: 1, tx: 0, ty: 0 }
          const realIdx = rtl ? len - 1 - tIdx : tIdx
          const wrap = imgWrapRefs.current[realIdx]
          if (wrap) {
            wrap.style.transition = ZOOM_SPRING()
            wrap.style.transform = 'translate3d(0, 0, 0) scale(1)'
          }
        }
      } else if (g.mode === null) {
        // Stationary tap — double-tap to toggle zoom
        const now = Date.now()
        const realIdx = rtl ? len - 1 - tIdx : tIdx
        if (now - lastTapRef.current < 280) {
          const wrap = imgWrapRefs.current[realIdx]
          if (wrap) wrap.style.transition = ZOOM_SPRING()
          if (zoomRef.current.scale > 1.05) {
            zoomRef.current = { scale: 1, tx: 0, ty: 0 }
          } else {
            zoomRef.current = { scale: 2.5, tx: 0, ty: 0 }
          }
          applyImgTransform(
            zoomRef.current.tx,
            zoomRef.current.ty,
            zoomRef.current.scale,
          )
          lastTapRef.current = 0
        } else {
          lastTapRef.current = now
        }
      }

      gestureRef.current = null
      pinchRef.current = null
    }

    // Non-passive touchmove so preventDefault() is honoured.
    track.addEventListener('touchstart', handleTouchStart, { passive: false })
    track.addEventListener('touchmove', handleTouchMove, { passive: false })
    track.addEventListener('touchend', handleTouchEnd)
    track.addEventListener('touchcancel', handleTouchEnd)
    return () => {
      track.removeEventListener('touchstart', handleTouchStart)
      track.removeEventListener('touchmove', handleTouchMove)
      track.removeEventListener('touchend', handleTouchEnd)
      track.removeEventListener('touchcancel', handleTouchEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  const handleSave = useCallback(async () => {
    const url = images[index]
    if (!url) return
    await saveImageToDevice(url, lang)
  }, [images, index, lang])

  if (!mounted) return null

  return (
    <div
      data-overlay="true"
      className="hai-lightbox-overlay hai-lightbox-overlay--flush hai-lightbox-root"
    >
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="hai-lightbox__backdrop"
        data-entered={entered ? 'true' : 'false'}
        style={{ opacity: entered ? 1 : 0 }}
      />

      {/* Horizontal track of images. dir="ltr" forces left-to-right flex
          ordering so img[0] is at x=0, img[1] at x=vw, etc. */}
      <div
        ref={trackRef}
        className="hai-lightbox__track"
        dir="ltr"
        style={{
          transform: `translate3d(${-trackIdx * 100}%, 0, 0)`,
          transition: SPRING(),
        }}
      >
        {images.map((url, i) => (
          <div
            key={i}
            className="hai-lightbox__slide"
            style={{ order: isRTL ? images.length - 1 - i : i }}
          >
            {/* Outer wrapper: enter fade+scale animation */}
            <div
              className="hai-lightbox__enter"
              data-entered={entered ? 'true' : 'false'}
            >
              {/* Inner wrapper: pinch/pan transform (runtime gesture state) */}
              <div
                ref={(el) => {
                  imgWrapRefs.current[i] = el
                }}
                className="hai-lightbox__gesture"
                style={{ transform: 'translate3d(0,0,0) scale(1)' }}
              >
                <img
                  src={url}
                  alt=""
                  draggable={false}
                  className="hai-lightbox__image"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Top chrome — close + counter */}
      <div
        className="hai-lightbox-controls hai-lightbox-controls--top hai-lightbox__chrome-enter"
        data-entered={entered ? 'true' : 'false'}
      >
        <button
          onClick={onClose}
          className="hai-lightbox__btn"
          aria-label="Close"
        >
          <FiX className="hai-icon-lg" />
        </button>
        {images.length > 1 && (
          <div className="hai-lightbox__counter">
            {index + 1} / {images.length}
          </div>
        )}
        <button
          onClick={handleSave}
          className="hai-lightbox__btn"
          aria-label="Save"
        >
          <FiDownload className="hai-icon-lg" />
        </button>
      </div>

      {/* Bottom chrome — animated pill dots. */}
      {images.length > 1 && (
        <div
          className="hai-lightbox__pager hai-lightbox__chrome-enter hai-lightbox__chrome-enter--bottom"
          data-entered={entered ? 'true' : 'false'}
        >
          {images.map((_, i) => (
            <span
              key={i}
              className="hai-lightbox__dot"
              data-active={i === index ? 'true' : 'false'}
            />
          ))}
        </div>
      )}
    </div>
  )
}

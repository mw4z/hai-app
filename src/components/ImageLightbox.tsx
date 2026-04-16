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

const SPRING =
  'transform 420ms cubic-bezier(0.22, 0.61, 0.36, 1)'
const ZOOM_SPRING =
  'transform 300ms cubic-bezier(0.22, 0.61, 0.36, 1)'

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
  const [index, setIndex] = useState(initialIndex)
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
    track.style.transition = SPRING
    track.style.transform = `translate3d(${-index * 100}%, 0, 0)`

    // Reset zoom state of the newly-active image
    zoomRef.current = { scale: 1, tx: 0, ty: 0 }
    const wrap = imgWrapRefs.current[index]
    if (wrap) {
      wrap.style.transition = ZOOM_SPRING
      wrap.style.transform = 'translate3d(0, 0, 0) scale(1)'
    }
  }, [index])

  const getActiveWrap = () => imgWrapRefs.current[index]

  function applyImgTransform(tx: number, ty: number, scale: number) {
    const wrap = getActiveWrap()
    if (!wrap) return
    wrap.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`
  }

  // Keep mutable refs of index/length so the native listeners (which
  // are attached once per open) can read the current values without
  // being re-registered on every render.
  const indexRef = useRef(index)
  const imagesLenRef = useRef(images.length)
  const onCloseRef = useRef(onClose)
  useEffect(() => { indexRef.current = index }, [index])
  useEffect(() => { imagesLenRef.current = images.length }, [images.length])
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

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
      const wrap = imgWrapRefs.current[indexRef.current]
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
      const idx = indexRef.current
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
        if ((idx === 0 && dx > 0) || (idx === lenm1 && dx < 0)) {
          offset = dx * 0.32
        }
        if (trackRef.current) {
          const vw = window.innerWidth
          trackRef.current.style.transform =
            `translate3d(${-idx * vw + offset}px, 0, 0)`
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
      const idx = indexRef.current
      const lenm1 = imagesLenRef.current - 1

      if (g.mode === 'h') {
        let next = idx
        if (totalDx < -H_SWIPE_PX || velX < -H_SWIPE_VEL) {
          next = Math.min(lenm1, idx + 1)
        } else if (totalDx > H_SWIPE_PX || velX > H_SWIPE_VEL) {
          next = Math.max(0, idx - 1)
        }
        if (trackRef.current) {
          trackRef.current.style.transition = SPRING
          const vw = window.innerWidth
          trackRef.current.style.transform = `translate3d(${-next * vw}px, 0, 0)`
        }
        if (next !== idx) {
          hapticLight()
          setIndex(next)
        }
      } else if (g.mode === 'v') {
        const shouldDismiss = totalDy > V_DISMISS_PX || velY > V_DISMISS_VEL
        if (shouldDismiss) {
          onCloseRef.current()
        } else {
          const wrap = imgWrapRefs.current[idx]
          if (wrap) {
            wrap.style.transition = ZOOM_SPRING
            wrap.style.transform = 'translate3d(0, 0, 0) scale(1)'
          }
          if (backdropRef.current) {
            backdropRef.current.style.transition = 'opacity 260ms ease-out'
            backdropRef.current.style.opacity = '1'
          }
        }
      } else if (g.mode === 'pinch') {
        if (zoomRef.current.scale <= 1.02) {
          zoomRef.current = { scale: 1, tx: 0, ty: 0 }
          const wrap = imgWrapRefs.current[idx]
          if (wrap) {
            wrap.style.transition = ZOOM_SPRING
            wrap.style.transform = 'translate3d(0, 0, 0) scale(1)'
          }
        }
      } else if (g.mode === null) {
        // Stationary tap — double-tap to toggle zoom
        const now = Date.now()
        if (now - lastTapRef.current < 280) {
          const wrap = imgWrapRefs.current[idx]
          if (wrap) wrap.style.transition = ZOOM_SPRING
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
      className="fixed inset-0 z-[99997] select-none"
      style={{ touchAction: 'none' }}
    >
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className={`absolute inset-0 bg-black transition-opacity duration-[260ms] ease-out ${
          entered ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Horizontal track of images. dir="ltr" forces left-to-right flex
          ordering so img[0] is at x=0, img[1] at x=vw, etc. Without this,
          RTL apps reverse the flex children and the translate math breaks
          (index 0 would show the last image, swiping right shows black). */}
      <div
        ref={trackRef}
        className="absolute inset-0 flex"
        dir="ltr"
        style={{
          transform: `translate3d(${-index * 100}%, 0, 0)`,
          transition: SPRING,
          willChange: 'transform',
          touchAction: 'none',
        }}
      >
        {images.map((url, i) => (
          <div
            key={i}
            className="relative w-full h-full flex-shrink-0 flex items-center justify-center px-4"
          >
            {/* Outer wrapper: enter fade+scale animation */}
            <div
              className={`transition-all duration-[320ms] ease-out ${
                entered ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.94]'
              }`}
              style={{ transitionDelay: entered ? '40ms' : '0ms' }}
            >
              {/* Inner wrapper: pinch/pan transform */}
              <div
                ref={(el) => {
                  imgWrapRefs.current[i] = el
                }}
                className="will-change-transform"
                style={{ transform: 'translate3d(0,0,0) scale(1)' }}
              >
                <img
                  src={url}
                  alt=""
                  draggable={false}
                  className="max-w-full max-h-[100dvh] object-contain pointer-events-none"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Top chrome — close + counter */}
      <div
        className={`absolute top-0 left-0 right-0 flex items-center justify-between px-4 transition-all duration-[320ms] ease-out ${
          entered ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
        }`}
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
          aria-label="Close"
        >
          <FiX className="w-5 h-5" />
        </button>
        {images.length > 1 && (
          <div className="px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md text-white text-xs font-bold tabular-nums">
            {index + 1} / {images.length}
          </div>
        )}
        <button
          onClick={handleSave}
          className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
          aria-label="Save"
        >
          <FiDownload className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom chrome — animated pill dots */}
      {images.length > 1 && (
        <div
          className={`absolute left-0 right-0 flex items-center justify-center gap-1.5 transition-all duration-[320ms] ease-out ${
            entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
          }`}
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 28px)' }}
        >
          {images.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all duration-[360ms] ease-out ${
                i === index ? 'w-7 bg-white' : 'w-1 bg-white/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

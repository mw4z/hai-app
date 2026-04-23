'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { hapticMedium, hapticLight } from '@/lib/haptic'

const THRESHOLD = 80
const MAX_PULL = 120

/* Shared motion helpers — read the calibrated tokens so the
   pull-to-refresh resistance and snap-back match the rest of the
   app (sheets, lightbox). See design-tokens.css. */
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
  const startY = useRef(0)
  const pulling = useRef(false)
  const hitThreshold = useRef(false)

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0) return
      if (document.querySelector('[data-overlay="true"]')) return
      // Any modal that locks body scroll is immune too — comments sheet,
      // confirm dialogs, prompt dialogs, delete-account, emergency sheets.
      if (document.body.style.overflow === 'hidden') return
      // Only active on feed, market, and threads list
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
      // Resistance divisor from the unified motion token (soft = 2.2
      // by default → roughly 0.45 factor, tuned so the pull has enough
      // travel to feel responsive without outrunning the indicator).
      const resistance = tokenNumber('--hai-resistance-soft', 2.2)
      const clamped = Math.min(delta / resistance, MAX_PULL)
      setPullY(clamped)
      // Intentionally DO NOT call e.preventDefault(). Letting the default
      // touch action through lets WKWebView play its native rubber-band
      // bounce at the same time — the refresh indicator floats with the
      // pull inside the rubber-band zone (iOS Mail pattern). Previous
      // commit f125efd removed this component entirely because the
      // old preventDefault killed the bounce; coexistence avoids that.
      // Haptic when crossing threshold
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
    // Passive now — we no longer call preventDefault so the WebView can
    // keep scheduling the native rubber-band on the same gesture.
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

  // Hai dots: 3 dots orbit around center dot
  const dotAngle = refreshing ? undefined : progress * 360
  const centerScale = 0.5 + progress * 0.5

  return (
    <div
      className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{
        top: 'env(safe-area-inset-top, 0px)',
        transform: `translateY(${pullY - 52}px)`,
        transition: pulling.current
          ? 'none'
          : reducedMotion()
            ? 'none'
            : `transform ${motionToken('--hai-dur-slow', '260ms')} ${motionToken('--hai-ease-standard', 'cubic-bezier(0.22, 1, 0.36, 1)')}`,
      }}
    >
      <div className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
        ready ? 'bg-primary-600 scale-110' : 'bg-white dark:bg-gray-800'
      }`}>
        <svg viewBox="0 0 48 48" className="w-8 h-8" style={refreshing ? { animation: 'spin 1.2s linear infinite' } : undefined}>
          {/* Center dot */}
          <circle
            cx="24" cy="24"
            r={ready ? 5 : 4}
            fill={ready ? 'white' : '#00a884'}
            style={{ transform: `scale(${centerScale})`, transformOrigin: '24px 24px', transition: 'all 0.2s' }}
          />
          {/* Orbiting dots */}
          {[0, 120, 240].map((baseAngle, i) => {
            const angle = ((dotAngle ?? 0) + baseAngle) * Math.PI / 180
            const radius = 10 + progress * 2
            const x = 24 + Math.cos(angle) * radius
            const y = 24 + Math.sin(angle) * radius
            const dotR = ready ? 3 : 2 + progress
            const opacity = 0.3 + progress * 0.7
            return (
              <circle
                key={i}
                cx={x} cy={y} r={dotR}
                fill={ready ? 'white' : '#00a884'}
                opacity={opacity}
                style={{ transition: refreshing ? 'none' : 'all 0.1s' }}
              />
            )
          })}
          {/* Connecting lines (subtle) */}
          {ready && !refreshing && (
            <circle cx="24" cy="24" r="12" fill="none" stroke="white" strokeWidth="0.5" opacity="0.3" strokeDasharray="3 5" />
          )}
        </svg>
      </div>
    </div>
  )
}

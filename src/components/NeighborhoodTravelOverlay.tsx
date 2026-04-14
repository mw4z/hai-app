'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FiNavigation, FiMapPin } from 'react-icons/fi'
import { hapticMedium, hapticSuccess } from '@/lib/haptic'

/**
 * Full-screen branded transition that plays when the user switches
 * neighborhoods. A map pin arcs from the "from" marker to the "to"
 * marker along a dashed trail, with the destination name fading in.
 *
 * Triggered by dispatching a `hai:travel-nbhd` CustomEvent on window:
 *
 *   window.dispatchEvent(new CustomEvent('hai:travel-nbhd', {
 *     detail: { from: 'حيّك', to: 'الملز', href: '/feed?neighborhood=abc' }
 *   }))
 *
 * The overlay handles the router.push itself — callers only dispatch
 * the event and close their own UI.
 */

type Payload = { from: string; to: string; href: string }
type Phase = 'idle' | 'travel' | 'arrive' | 'fade'

export default function NeighborhoodTravelOverlay() {
  const router = useRouter()
  const [payload, setPayload] = useState<Payload | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [isRTL, setIsRTL] = useState(false)

  useEffect(() => {
    function onTravel(e: Event) {
      const detail = (e as CustomEvent<Payload>).detail
      if (!detail || !detail.href) return
      hapticMedium()
      setIsRTL(document.documentElement.getAttribute('dir') === 'rtl')
      setPayload(detail)
      setPhase('travel')
    }
    window.addEventListener('hai:travel-nbhd', onTravel as EventListener)
    return () => window.removeEventListener('hai:travel-nbhd', onTravel as EventListener)
  }, [])

  // One-shot timer chain that fires when a new payload arrives. IMPORTANT:
  // this effect depends only on `payload`, not on `phase` — otherwise the
  // intermediate setPhase() calls would cause React to clean up and cancel
  // the remaining timers, leaving the overlay permanently stuck.
  useEffect(() => {
    if (!payload) return
    const timers: Array<ReturnType<typeof setTimeout>> = []
    timers.push(setTimeout(() => router.push(payload.href), 340))
    timers.push(
      setTimeout(() => {
        hapticSuccess()
        setPhase('arrive')
      }, 560),
    )
    timers.push(setTimeout(() => setPhase('fade'), 820))
    timers.push(
      setTimeout(() => {
        setPayload(null)
        setPhase('idle')
      }, 1120),
    )
    return () => timers.forEach(clearTimeout)
  }, [payload, router])

  if (!payload || phase === 'idle') return null

  const fading = phase === 'fade'

  return (
    <div
      data-overlay="true"
      className={`fixed inset-0 z-[99990] flex items-center justify-center transition-opacity duration-300 ease-out ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ pointerEvents: 'auto' }}
      aria-hidden
    >
      {/* Clean brand wash — no blobs, no radial glow */}
      <div className="absolute inset-0 bg-white dark:bg-gray-950" />
      <div
        className="absolute inset-0 dark:hidden"
        style={{
          background:
            'linear-gradient(180deg, #ffffff 0%, #f0fdf4 60%, #dcfce7 100%)',
        }}
      />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          background:
            'linear-gradient(180deg, #0a0f0c 0%, #0d1f15 60%, #0f2a1c 100%)',
        }}
      />

      <div className="relative w-full max-w-sm px-6 text-center">
        {/* From — fading out */}
        <p className="text-[10px] uppercase tracking-[0.25em] text-primary-600/50 dark:text-primary-400/50 font-bold mb-1">
          ● ● ●
        </p>
        <div className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-10 hai-label-out">
          {payload.from}
        </div>

        {/* Arc + traveling pin */}
        <div
          className="relative mx-auto mb-10"
          style={{ width: 280, height: 110 }}
        >
          {/* Dashed curved trail */}
          <svg
            className="absolute left-0 w-full overflow-visible"
            style={{ bottom: 0, height: 110 }}
            viewBox="0 0 280 110"
            fill="none"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="haiTrailGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#16a34a" stopOpacity="0.35" />
                <stop offset="50%" stopColor="#16a34a" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#16a34a" stopOpacity="0.35" />
              </linearGradient>
            </defs>
            <path
              d="M 22 96 Q 140 0 258 96"
              stroke="url(#haiTrailGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="hai-trail-draw"
            />
          </svg>

          {/* Start marker */}
          <div
            className="absolute w-6 h-6 rounded-full bg-white dark:bg-gray-900 border-2 border-primary-500 flex items-center justify-center shadow-md"
            style={{ bottom: 6, left: 10 }}
          >
            <div className="w-2 h-2 rounded-full bg-primary-500" />
          </div>
          {/* End marker */}
          <div
            className={`absolute w-6 h-6 rounded-full bg-white dark:bg-gray-900 border-2 flex items-center justify-center shadow-md transition-all duration-300 ${
              phase === 'arrive' || phase === 'fade'
                ? 'border-primary-600 scale-110 shadow-lg shadow-primary-500/40'
                : 'border-primary-400'
            }`}
            style={{ bottom: 6, right: 10 }}
          >
            <FiMapPin className="w-3 h-3 text-primary-600" />
          </div>

          {/* Traveling pin — transform-only animation for buttery-smooth GPU motion.
              Anchored at bottom:0 left:0, transforms carry it along the arc. */}
          <div
            className={`absolute w-14 h-14 ${isRTL ? 'hai-arc-pin-rtl' : 'hai-arc-pin-ltr'}`}
            style={{ bottom: 0, left: 0, willChange: 'transform' }}
          >
            <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 shadow-[0_10px_28px_rgba(22,163,74,0.5)] flex items-center justify-center">
              <FiNavigation className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        {/* To — fading in with bounce */}
        <p className="text-[10px] uppercase tracking-[0.25em] text-primary-600/70 dark:text-primary-400/70 font-bold mb-1">
          ● ● ●
        </p>
        <div className="hai-label-in">
          <div className="text-2xl font-black text-gray-900 dark:text-white leading-tight">
            {payload.to}
          </div>
        </div>
      </div>
    </div>
  )
}

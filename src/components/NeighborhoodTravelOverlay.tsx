'use client'

import { useEffect, useRef, useState } from 'react'
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
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([])

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

  useEffect(() => {
    if (phase !== 'travel' || !payload) return
    const timers = timersRef.current
    // Kick off navigation mid-arc
    timers.push(
      setTimeout(() => {
        router.push(payload.href)
      }, 340),
    )
    // Pin has arrived — success haptic
    timers.push(
      setTimeout(() => {
        hapticSuccess()
        setPhase('arrive')
      }, 560),
    )
    // Start fade out
    timers.push(setTimeout(() => setPhase('fade'), 820))
    // Unmount
    timers.push(
      setTimeout(() => {
        setPayload(null)
        setPhase('idle')
      }, 1120),
    )
    return () => {
      timers.forEach(clearTimeout)
      timersRef.current = []
    }
  }, [phase, payload, router])

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
      {/* Brand background — light */}
      <div
        className="absolute inset-0 dark:hidden"
        style={{
          background:
            'radial-gradient(ellipse at 50% 42%, #ecfdf5 0%, #d1fae5 40%, #bbf7d0 100%)',
        }}
      />
      {/* Brand background — dark */}
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          background:
            'radial-gradient(ellipse at 50% 42%, #0d2818 0%, #064e3b 45%, #022c22 100%)',
        }}
      />

      {/* Soft depth blobs */}
      <div className="absolute top-[18%] left-[8%] w-44 h-44 rounded-full bg-primary-300/25 dark:bg-primary-500/10 blur-3xl" />
      <div className="absolute bottom-[18%] right-[6%] w-52 h-52 rounded-full bg-primary-400/20 dark:bg-primary-400/10 blur-3xl" />

      <div className="relative w-full max-w-sm px-6 text-center">
        {/* From — fading out */}
        <p className="text-[10px] uppercase tracking-[0.25em] text-primary-600/60 dark:text-primary-400/60 font-bold mb-1">
          ● ● ●
        </p>
        <div className="text-sm font-bold text-primary-800/70 dark:text-primary-200/70 mb-8 hai-label-out">
          {payload.from}
        </div>

        {/* Arc + traveling pin */}
        <div
          className="relative mx-auto mb-8"
          style={{ width: 280, height: 96 }}
        >
          {/* Dashed curved trail */}
          <svg
            className="absolute inset-0 w-full h-full overflow-visible"
            viewBox="0 0 280 96"
            fill="none"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="haiTrailGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#16a34a" stopOpacity="0.35" />
                <stop offset="50%" stopColor="#16a34a" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#16a34a" stopOpacity="0.35" />
              </linearGradient>
            </defs>
            <path
              d="M 22 84 Q 140 -14 258 84"
              stroke="url(#haiTrailGrad)"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="hai-trail-draw"
            />
          </svg>

          {/* Start marker */}
          <div
            className="absolute w-6 h-6 rounded-full bg-white dark:bg-gray-900 border-2 border-primary-500 flex items-center justify-center shadow-md"
            style={{
              bottom: 4,
              left: isRTL ? 'auto' : 10,
              right: isRTL ? 10 : 'auto',
            }}
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
            style={{
              bottom: 4,
              right: isRTL ? 'auto' : 10,
              left: isRTL ? 10 : 'auto',
            }}
          >
            <FiMapPin className="w-3 h-3 text-primary-600" />
          </div>

          {/* Traveling pin */}
          <div
            className={`absolute w-14 h-14 ${isRTL ? 'hai-arc-pin-rtl' : 'hai-arc-pin-ltr'}`}
          >
            <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 shadow-[0_10px_28px_rgba(22,163,74,0.55)] flex items-center justify-center">
              <FiNavigation
                className={`w-6 h-6 text-white ${isRTL ? '-scale-x-100' : ''}`}
              />
              <div className="absolute inset-0 rounded-full bg-primary-400 opacity-40 animate-ping" />
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

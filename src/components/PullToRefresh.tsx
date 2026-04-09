'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { hapticMedium, hapticLight } from '@/lib/haptic'

const THRESHOLD = 80
const MAX_PULL = 120

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
      const clamped = Math.min(delta * 0.5, MAX_PULL)
      setPullY(clamped)
      if (delta > 10) e.preventDefault()
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
    document.addEventListener('touchmove', onTouchMove, { passive: false })
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
      style={{ top: 'env(safe-area-inset-top, 0px)', transform: `translateY(${pullY - 52}px)`, transition: pulling.current ? 'none' : 'transform 0.3s ease' }}
    >
      <div className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${
        ready ? 'bg-primary-600 scale-110' : 'bg-white dark:bg-gray-800'
      }`}>
        <svg viewBox="0 0 48 48" className="w-8 h-8" style={refreshing ? { animation: 'spin 1.2s linear infinite' } : undefined}>
          {/* Center dot */}
          <circle
            cx="24" cy="24"
            r={ready ? 5 : 4}
            fill={ready ? 'white' : '#16a34a'}
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
                fill={ready ? 'white' : '#16a34a'}
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

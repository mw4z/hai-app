'use client'

import { useRef, useState } from 'react'
import { hapticMedium, hapticHeavy } from '@/lib/haptic'

interface Props {
  onDelete: () => void
  children: React.ReactNode
}

export default function SwipeToDelete({ onDelete, children }: Props) {
  const startX = useRef(0)
  const currentX = useRef(0)
  const swiping = useRef(false)
  const hapticFired = useRef(false)
  const [offset, setOffset] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'swiping' | 'deleting' | 'gone'>('idle')

  const THRESHOLD = 80

  function onTouchStart(e: React.TouchEvent) {
    if (phase !== 'idle') return
    startX.current = e.touches[0].clientX
    currentX.current = 0
    swiping.current = true
    setPhase('swiping')
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!swiping.current || phase === 'deleting' || phase === 'gone') return
    const delta = e.touches[0].clientX - startX.current
    if (delta < 0) { setOffset(0); return }
    currentX.current = delta
    setOffset(Math.min(delta, 160))
    if (delta >= THRESHOLD && !hapticFired.current) { hapticMedium(); hapticFired.current = true }
    if (delta < THRESHOLD) hapticFired.current = false
  }

  function onTouchEnd() {
    swiping.current = false
    if (currentX.current > THRESHOLD) {
      hapticHeavy()
      setPhase('deleting')
      // Slide out fully
      setOffset(window.innerWidth)
      // After slide-out animation, collapse height then call onDelete
      setTimeout(() => {
        setPhase('gone')
        setTimeout(() => onDelete(), 200)
      }, 250)
    } else {
      setOffset(0)
      setPhase('idle')
    }
  }

  if (phase === 'gone') {
    return <div className="overflow-hidden transition-all duration-200" style={{ maxHeight: 0, opacity: 0, margin: 0, padding: 0 }} />
  }

  const progress = Math.min(offset / THRESHOLD, 1)

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Red delete background */}
      <div
        className="absolute inset-0 bg-red-500 flex items-center px-5"
        style={{ opacity: Math.min(progress, 0.9) }}
      >
        <span className="text-white font-bold text-sm flex items-center gap-2">
          🗑 {typeof document !== 'undefined' && document.documentElement.dir === 'rtl' ? 'حذف' : 'Delete'}
        </span>
      </div>

      {/* Swipeable content */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: swiping.current ? 'none' : 'transform 0.25s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'

/**
 * Custom foreground push toast.
 *
 *  - Replaces (not stacks) the previous one — `id: 'hai-push'`
 *    means a second showPushToast call dismisses the first one
 *    cleanly so toasts come "one by one" instead of piling on top
 *    of each other.
 *  - Swipe up or sideways to dismiss instantly.
 *  - Auto-dismiss after AUTO_DISMISS_MS.
 *  - Tap → optional callback (deeplink navigation).
 */

const AUTO_DISMISS_MS = 4500
const SWIPE_DISMISS_PX = 60

export interface PushToastInput {
  title?: string | null
  body?: string | null
  icon?: string
  onTap?: () => void
}

export function showPushToast({ title, body, icon = '🔔', onTap }: PushToastInput) {
  const text = [title, body].filter(Boolean).join(' — ')
  if (!text) return

  toast.custom(
    (tt) => (
      <PushToastView
        toastId={tt.id}
        visible={tt.visible}
        title={title}
        body={body}
        icon={icon}
        onTap={onTap}
      />
    ),
    {
      // Stable id → react-hot-toast replaces the existing toast
      // instead of stacking. This is the "one by one" behavior.
      id: 'hai-push',
      duration: AUTO_DISMISS_MS,
      position: 'top-center',
    },
  )
}

function PushToastView({
  toastId,
  visible,
  title,
  body,
  icon,
  onTap,
}: {
  toastId: string
  visible: boolean
  title?: string | null
  body?: string | null
  icon: string
  onTap?: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  dragRef.current = drag

  useEffect(() => () => {
    start.current = null
    setDrag(null)
  }, [])

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY }
    setDrag({ dx: 0, dy: 0 })
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!start.current) return
    const t = e.touches[0]
    setDrag({ dx: t.clientX - start.current.x, dy: t.clientY - start.current.y })
  }
  const onTouchEnd = () => {
    const d = dragRef.current
    start.current = null
    if (!d) { setDrag(null); return }
    // Up-swipe or horizontal swipe past threshold dismisses.
    const dismiss =
      Math.abs(d.dx) > SWIPE_DISMISS_PX ||
      d.dy < -SWIPE_DISMISS_PX
    if (dismiss) {
      toast.dismiss(toastId)
    }
    setDrag(null)
  }

  const transform = drag
    ? `translate3d(${drag.dx}px, ${Math.min(0, drag.dy)}px, 0)`
    : undefined
  const opacity = drag
    ? Math.max(0.3, 1 - Math.max(Math.abs(drag.dx), Math.abs(drag.dy)) / 160)
    : undefined

  return (
    <div
      ref={ref}
      onClick={() => {
        if (onTap) onTap()
        toast.dismiss(toastId)
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      role="status"
      aria-live="polite"
      style={{
        transform,
        opacity,
        transition: drag ? 'none' : 'transform 200ms ease, opacity 200ms ease',
      }}
      className={
        'pointer-events-auto select-none cursor-pointer max-w-[420px] w-[92vw] ' +
        'rounded-2xl px-3.5 py-3 shadow-xl border ' +
        'bg-white/95 dark:bg-gray-800/95 backdrop-blur ' +
        'border-gray-200/60 dark:border-gray-700/60 ' +
        'flex items-start gap-3 ' +
        (visible ? 'animate-fade-in-down' : '')
      }
    >
      <div className="text-xl leading-none flex-shrink-0 mt-0.5" aria-hidden="true">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        {title && (
          <div className="text-[13px] font-semibold text-gray-900 dark:text-white truncate">
            {title}
          </div>
        )}
        {body && (
          <div className="text-[12px] text-gray-600 dark:text-gray-300 line-clamp-2 leading-snug">
            {body}
          </div>
        )}
      </div>
    </div>
  )
}

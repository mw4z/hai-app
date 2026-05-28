'use client'

import { useCallback, useRef } from 'react'

/**
 * Long-press detector — extracted from ChatClient.tsx's local useLongPress.
 * Identical behaviour so Square bubbles feel the same as DM bubbles:
 *   - 400ms touch hold fires onLongPress
 *   - quick double-tap fires onDoubleTap
 *   - right-click / context-menu also fires onLongPress (desktop dev)
 *
 * Returns spread-able event props for the bubble container. Cancels on
 * touchmove so a scroll gesture doesn't trip the long press by accident.
 */
export function useSquareLongPress(
  onLongPress: () => void,
  onDoubleTap: () => void = () => {},
  ms = 400,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const lastTapRef = useRef(0)
  const longPressRef = useRef(onLongPress)
  const doubleTapRef = useRef(onDoubleTap)
  longPressRef.current = onLongPress
  doubleTapRef.current = onDoubleTap

  const start = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      // Prevent the browser's built-in long-press context menu / text
      // selection menu on iOS — interferes with the in-app sheet.
      e.preventDefault()
      timerRef.current = setTimeout(() => longPressRef.current(), ms)
    },
    [ms],
  )

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current)
  }, [])

  const handleClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now()
    if (now - lastTapRef.current < 350) {
      e.preventDefault()
      doubleTapRef.current()
      lastTapRef.current = 0
    } else {
      lastTapRef.current = now
    }
  }, [])

  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      longPressRef.current()
    },
    onClick: handleClick,
  }
}

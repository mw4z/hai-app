'use client'

import { useEffect, useRef, useCallback } from 'react'

/**
 * Auto-refresh hook — polls a function at an interval and on tab focus.
 * Stops when the tab is hidden.
 */
export function useAutoRefresh(
  fetchFn: () => void | Promise<void>,
  intervalMs: number = 10000,
  enabled: boolean = true,
) {
  const savedFn = useRef(fetchFn)
  savedFn.current = fetchFn

  useEffect(() => {
    if (!enabled) return

    // Poll at interval
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        savedFn.current()
      }
    }, intervalMs)

    // Refetch on tab focus
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        savedFn.current()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs, enabled])
}

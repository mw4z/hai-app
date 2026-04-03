'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * RouteTransition — overlays a branded loader during navigation.
 * Catches both <a> clicks and router.push() calls.
 */
export default function RouteTransition() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)
  const [fadeOut, setFadeOut] = useState(false)
  const prevUrl = useRef(pathname + (searchParams?.toString() || ''))
  const timer = useRef<ReturnType<typeof setTimeout>>()

  // When pathname or search params change → new page arrived → fade out
  useEffect(() => {
    const currentUrl = pathname + (searchParams?.toString() || '')
    if (currentUrl !== prevUrl.current) {
      prevUrl.current = currentUrl
      setFadeOut(true)
      timer.current = setTimeout(() => {
        setVisible(false)
        setFadeOut(false)
      }, 250)
    }
    return () => clearTimeout(timer.current)
  }, [pathname, searchParams])

  // Intercept link clicks
  const handleClick = useCallback((e: MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href) return
    if (href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
    if (anchor.hasAttribute('download') || anchor.target === '_blank') return
    if (href === pathname) return
    setVisible(true)
    setFadeOut(false)
  }, [pathname])

  useEffect(() => {
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [handleClick])

  // Intercept router.push by patching history.pushState
  useEffect(() => {
    const origPush = history.pushState.bind(history)
    const origReplace = history.replaceState.bind(history)

    history.pushState = function (...args) {
      setVisible(true)
      setFadeOut(false)
      return origPush(...args)
    }
    history.replaceState = function (...args) {
      // Don't show loader for replaceState (usually same-page updates)
      return origReplace(...args)
    }

    return () => {
      history.pushState = origPush
      history.replaceState = origReplace
    }
  }, [])

  // Browser back/forward
  useEffect(() => {
    const onPopState = () => {
      setVisible(true)
      setFadeOut(false)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Safety: auto-hide after 8s
  useEffect(() => {
    if (!visible) return
    const safety = setTimeout(() => {
      setFadeOut(true)
      setTimeout(() => { setVisible(false); setFadeOut(false) }, 250)
    }, 8000)
    return () => clearTimeout(safety)
  }, [visible])

  return null
}

'use client'

import { useEffect } from 'react'

declare global {
  interface Window {
    Capacitor?: { isNativePlatform: () => boolean; getPlatform: () => string }
  }
}

export default function CapacitorBridge() {
  useEffect(() => {
    if (!window.Capacitor?.isNativePlatform()) return

    // Re-apply theme now that native bridge is ready — matchMedia may not
    // have worked correctly during the initial head script execution
    const theme = localStorage.getItem('hai_theme') || 'system'
    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.classList.toggle('dark', isDark)
    }

    async function init() {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar')
        const isDark = document.documentElement.classList.contains('dark')
        await StatusBar.setOverlaysWebView({ overlay: true })
        await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
        await StatusBar.setBackgroundColor({ color: '#00000000' })
      } catch {}
    }

    init()

    const observer = new MutationObserver(async () => {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar')
        const isDark = document.documentElement.classList.contains('dark')
        await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
      } catch {}
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [])

  return null
}

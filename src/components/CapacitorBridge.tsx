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

    async function init() {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar')
        const isDark = document.documentElement.classList.contains('dark')
        // Overlay: true = content goes behind status bar, we handle safe area in CSS
        await StatusBar.setOverlaysWebView({ overlay: true })
        await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
        await StatusBar.setBackgroundColor({ color: '#00000000' }) // transparent
        // Signal to CSS that safe area is needed
        document.documentElement.classList.add('capacitor-ios')
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

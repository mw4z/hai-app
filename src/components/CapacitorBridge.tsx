'use client'

import { useEffect } from 'react'
// Side-effect import: boots the sound module at app startup so its
// first-gesture unlock listeners are attached before the user's first
// tap — otherwise the very first playDelete/playSend fires against a
// still-suspended AudioContext and is silent.
import '@/lib/sound'

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

      // Switch keyboard resize to 'native' at runtime — iOS's built-in
      // keyboard avoidance animates fixed elements in sync with the
      // keyboard (no delay). The default 'body' mode resizes the body
      // AFTER the animation, causing a ~300ms delay.
      try {
        const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard')
        await Keyboard.setResizeMode({ mode: KeyboardResize.Native })
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

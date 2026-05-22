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
    console.log('[KB] CapacitorBridge mount', { platform: window.Capacitor?.getPlatform?.() })
    // Tag the root with the platform ASAP so CSS can opt features
    // in/out per OS. Runs even on web so browsers get data-platform="web".
    // The Android WebView mis-handles the template-level transform slide
    // (glitches the page content mid-animation), so globals.css uses
    // this hook to swap the slide for an opacity fade on Android.
    try {
      const p = window.Capacitor?.getPlatform?.() || 'web'
      document.documentElement.dataset.platform = p
    } catch {}

    if (!window.Capacitor?.isNativePlatform()) return

    // Android's WebView reports env(safe-area-inset-bottom) as 0 even in
    // edge-to-edge mode (the system nav bar isn't exposed as a CSS inset
    // the way iOS exposes the home indicator), so every env()-based bottom
    // padding was a no-op on Android and footer buttons sat on the nav
    // bar. Feed the inset through --hai-safe-bottom: honor env() when a
    // device DOES report it, else floor at 1.5rem so footers/sheets clear
    // the nav bar. iOS keeps the pure env() :root default untouched.
    try {
      if ((window.Capacitor?.getPlatform?.() || '') === 'android') {
        document.documentElement.style.setProperty(
          '--hai-safe-bottom',
          'max(env(safe-area-inset-bottom, 0px), 2.1rem)',
        )
      }
    } catch {}

    // Read cookie first (matches inline head script), then localStorage.
    function readThemeCookie(): string | null {
      const m = document.cookie.match(/(?:^|; )hai_theme=([^;]*)/)
      return m ? decodeURIComponent(m[1]) : null
    }
    let theme = readThemeCookie()
    if (!theme) theme = localStorage.getItem('hai_theme')
    if (!theme) theme = 'system'

    // Back-fill cookie from legacy localStorage-only users so the next
    // cold-start picks it up server-side without a flash.
    if (!readThemeCookie() && theme !== 'system') {
      document.cookie = `hai_theme=${theme}; path=/; max-age=31536000; SameSite=Lax`
    }

    // Re-apply theme now that native bridge is ready — matchMedia may not
    // have worked correctly during the initial head script execution
    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.classList.toggle('dark', isDark)
    } else {
      document.documentElement.classList.toggle('dark', theme === 'dark')
    }

    async function init() {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar')
        const isDark = document.documentElement.classList.contains('dark')
        await StatusBar.setOverlaysWebView({ overlay: true })
        await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
        // Was '#00000000' (transparent). On Android < 10 the OS auto-
        // applies a gray contrast SCRIM to translucent system bars
        // (enforceStatusBarContrast doesn't exist pre-API 29), and that
        // scrim was reading as the gray bar at top/bottom that some
        // older Android phones report. Setting an opaque brand-tinted
        // color removes the transparency the OS scrims against. iOS
        // ignores this call.
        await StatusBar.setBackgroundColor({ color: isDark ? '#101619' : '#ffffff' })
      } catch {}

      // Keyboard resize mode, per-platform:
      //  iOS → 'native'  — WKWebView content inset tracks the
      //                    keyboard animation frame-for-frame.
      //                    Gives the no-delay feel iOS users expect.
      //  Android → 'body' — with windowSoftInputMode='adjustResize'
      //                    in the manifest, the OS shrinks the
      //                    Activity + WebView cleanly. 'body' mode
      //                    then resizes document.body to match, which
      //                    is what visualViewport listeners read.
      //                    'native' on Android caused the composer to
      //                    float in mid-screen because the inset
      //                    wasn't being fed back into CSS layout.
      try {
        const { Keyboard, KeyboardResize, KeyboardStyle } = await import('@capacitor/keyboard')
        const platform = window.Capacitor?.getPlatform?.() || 'web'
        await Keyboard.setResizeMode({
          mode: platform === 'ios' ? KeyboardResize.Native : KeyboardResize.Body,
        })
        // iOS keyboard appearance — pinned to the app's chosen theme
        // via Capacitor's native setStyle() call. CSS color-scheme and
        // <meta name="color-scheme"> are NOT reliably honored by
        // WKWebView for keyboard color; only this native call is.
        // No-op on Android.
        if (platform === 'ios') {
          const isDark = document.documentElement.classList.contains('dark')
          // Light app → Default (modern white iOS keyboard, what
          // WhatsApp / Notes / Messages all show in iOS Light mode).
          // KeyboardStyle.Light is the LEGACY style — visible gray
          // substrate, looks dated against the rest of iOS.
          // Dark app → force Dark explicitly so the keyboard is dark
          // even if iOS system is in light mode.
          const style = isDark ? KeyboardStyle.Dark : KeyboardStyle.Default
          console.log('[KB] init setStyle call', { platform, isDark, style: isDark ? 'DARK' : 'DEFAULT' })
          await Keyboard.setStyle({ style })
          console.log('[KB] init setStyle resolved')
        }
      } catch (err) {
        console.error('[KB] init setStyle threw', err)
      }
    }

    init()

    const observer = new MutationObserver(async () => {
      const isDark = document.documentElement.classList.contains('dark')
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar')
        await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light })
        await StatusBar.setBackgroundColor({ color: isDark ? '#101619' : '#ffffff' })
      } catch {}
      // Keep the iOS keyboard color in sync with subsequent theme
      // toggles (CapacitorBridge resume, ProfileClient picker, OS
      // appearance change). Same Capacitor.Keyboard.setStyle call as
      // init(), no-op on non-iOS.
      try {
        const platform = window.Capacitor?.getPlatform?.() || 'web'
        if (platform === 'ios') {
          const { Keyboard, KeyboardStyle } = await import('@capacitor/keyboard')
          const style = isDark ? KeyboardStyle.Dark : KeyboardStyle.Default
          console.log('[KB] observer setStyle call', { isDark, style: isDark ? 'DARK' : 'DEFAULT' })
          await Keyboard.setStyle({ style })
          console.log('[KB] observer setStyle resolved')
        }
      } catch (err) {
        console.error('[KB] observer setStyle threw', err)
      }
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    // Re-apply theme when the app comes back to the foreground.
    //
    // Why: on iPadOS WKWebView the `prefers-color-scheme` matchMedia
    // `change` event does NOT fire reliably when the user toggles
    // iPadOS Appearance while the app is backgrounded — the WebView
    // caches the value at creation time. Result: the user reports
    // "dark mode not supported on iPad". Listening to App's
    // appStateChange and re-evaluating the theme on resume is the
    // canonical fix; it also covers iPhone and Android for free.
    let appListenerHandle: { remove: () => void } | null = null
    ;(async () => {
      try {
        const { App } = await import('@capacitor/app')
        appListenerHandle = await App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
          if (!isActive) return
          // Re-read the theme cookie/localStorage AND the live
          // matchMedia, so a user who's on "system" picks up an iPadOS
          // appearance change made while we were backgrounded.
          let th = readThemeCookie()
          if (!th) {
            try { th = localStorage.getItem('hai_theme') } catch {}
          }
          if (!th) th = 'system'
          const isDarkNow = th === 'dark' ||
            (th === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
          document.documentElement.classList.toggle('dark', isDarkNow)
        })
      } catch { /* @capacitor/app not available — no-op on web */ }
    })()

    return () => {
      observer.disconnect()
      try { appListenerHandle?.remove() } catch {}
    }
  }, [])

  return null
}

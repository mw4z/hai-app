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

    // ── Native splash hide trigger ──────────────────────────────
    // capacitor.config.ts sets launchAutoHide:false, so the native
    // splash (iOS storyboard handoff → Capacitor SplashScreen plugin
    // overlay) STAYS UP until we explicitly call hide(). We hide it
    // once the document has finished loading AND any pending share-
    // link / push deeplink has resolved (FeedClient clears the
    // hai:deeplink-redirect flag once the highlight effect lands).
    //
    // This is the single source of splash dismiss — there's no JS-
    // side AppSplash overlay anymore, so the native splash → app
    // handoff is one fade, not a chain of re-mounted layers.
    let splashHideTimer: ReturnType<typeof setTimeout> | null = null
    const splashStarted = Date.now()
    const SPLASH_MIN_MS = 600        // minimum visible time, even if page is instant
    const SPLASH_MAX_MS = 8000       // hard ceiling — always hide by this
    const SPLASH_POLL_MS = 150       // deeplink-flag poll cadence
    let splashHidden = false

    async function hideNativeSplash() {
      if (splashHidden) return
      splashHidden = true
      try {
        const { SplashScreen } = await import('@capacitor/splash-screen')
        await SplashScreen.hide({ fadeOutDuration: 300 })
      } catch {}
    }

    function deeplinkPending(): boolean {
      try { return sessionStorage.getItem('hai:deeplink-redirect') === '1' } catch { return false }
    }

    function trySplashHide() {
      if (splashHidden) return
      const elapsed = Date.now() - splashStarted
      if (elapsed >= SPLASH_MAX_MS) {
        try { sessionStorage.removeItem('hai:deeplink-redirect') } catch {}
        hideNativeSplash()
        return
      }
      if (deeplinkPending()) {
        splashHideTimer = setTimeout(trySplashHide, SPLASH_POLL_MS)
        return
      }
      if (elapsed < SPLASH_MIN_MS) {
        splashHideTimer = setTimeout(trySplashHide, SPLASH_MIN_MS - elapsed)
        return
      }
      hideNativeSplash()
    }

    function armSplashHide() {
      if (document.readyState === 'complete') {
        trySplashHide()
      } else {
        window.addEventListener('load', trySplashHide, { once: true })
      }
    }
    armSplashHide()

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
    let urlListenerHandle: { remove: () => void } | null = null
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

        // Universal/App Links: when a shared https://app.hai-app.net/... link
        // opens the installed app, route it to the right in-app screen. Share
        // links are /s/post/<id> & /s/poll/<id>; the real content lives at
        // /feed?post= / /feed?poll= (mirrors the share pages). Other claimed
        // paths (/i, /threads, /directory) map 1:1.
        urlListenerHandle = await App.addListener('appUrlOpen', ({ url }: { url: string }) => {
          try {
            const u = new URL(url)
            if (u.host !== 'app.hai-app.net') return
            const seg = u.pathname.split('/').filter(Boolean)
            let target: string
            if (seg[0] === 's' && seg[1] === 'post' && seg[2]) target = '/feed?post=' + encodeURIComponent(seg[2])
            else if (seg[0] === 's' && seg[1] === 'poll' && seg[2]) target = '/feed?poll=' + encodeURIComponent(seg[2])
            else target = u.pathname + u.search
            const cur = window.location.pathname + window.location.search
            if (target && target !== cur) {
              // Set the deeplink-redirect flag BEFORE the assign so
              // the splash-hide poll (above, trySplashHide) keeps
              // the native splash up across the redirect. The
              // destination page's FeedClient clears the flag once
              // the highlight effect locates the target post,
              // which lets the native splash fade exactly once at
              // the end of the chain — no visible flicker of the
              // /feed mount we're navigating away from.
              try {
                sessionStorage.setItem('hai:deeplink-redirect', '1')
                sessionStorage.setItem('hai:deeplink-landed-at', String(Date.now()))
              } catch {}
              window.location.assign(target)
            }
          } catch { /* malformed url — ignore */ }
        })
      } catch { /* @capacitor/app not available — no-op on web */ }
    })()

    return () => {
      observer.disconnect()
      try { appListenerHandle?.remove() } catch {}
      try { urlListenerHandle?.remove() } catch {}
      if (splashHideTimer) clearTimeout(splashHideTimer)
      window.removeEventListener('load', trySplashHide)
    }
  }, [])

  return null
}

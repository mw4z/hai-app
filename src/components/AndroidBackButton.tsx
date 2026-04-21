'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'

/**
 * Handles the Android hardware back button.
 *
 *   - On "root" screens (feed, market, threads, profile): first press shows
 *     a toast "press back again to exit", second press within 2 seconds
 *     minimizes the app via Capacitor App.exitApp(). Prevents the user from
 *     accidentally re-entering the login/onboarding flow by hitting back.
 *   - On every other route: falls back to the browser's history back, so
 *     in-app navigation (e.g. post detail → feed) still works.
 *   - iOS ignores this — it doesn't have a hardware back button and swipe
 *     back is handled by SwipeBack.
 */

const ROOT_PATHS = new Set(['/feed', '/market', '/threads', '/profile'])

export default function AndroidBackButton() {
  const pathname = usePathname()
  const router = useRouter()
  const { lang } = useLanguage()

  useEffect(() => {
    const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()
    const platform = typeof window !== 'undefined' ? (window as any).Capacitor?.getPlatform?.() : ''
    if (!isNative || platform !== 'android') return

    let listener: { remove?: () => void } | undefined
    let lastBackPress = 0

    ;(async () => {
      try {
        const { App } = await import('@capacitor/app')
        listener = await App.addListener('backButton', ({ canGoBack }) => {
          if (ROOT_PATHS.has(pathname || '')) {
            // Root screen — two-tap exit
            const now = Date.now()
            if (now - lastBackPress < 2000) {
              App.exitApp()
              return
            }
            lastBackPress = now
            toast(
              lang === 'en'
                ? 'Press back again to exit'
                : lang === 'ur'
                  ? 'باہر نکلنے کیلئے دوبارہ دبائیں'
                  : 'اضغط رجوع مرة أخرى للخروج',
              { duration: 2000 },
            )
            return
          }
          // Non-root screen — normal in-app back
          if (canGoBack) {
            router.back()
          } else {
            App.exitApp()
          }
        })
      } catch { /* @capacitor/app not available — nothing to do */ }
    })()

    return () => {
      try { listener?.remove?.() } catch { /* ignore */ }
    }
  }, [pathname, router, lang])

  return null
}

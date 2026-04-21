import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { Toaster } from 'react-hot-toast'
import RepToast from '@/components/RepToast'
import ErrorBoundary from '@/components/ErrorBoundary'
import AppSplash from '@/components/AppSplash'
import RouteTransition from '@/components/RouteTransition'
import ArrivalAlert from '@/components/ArrivalAlert'
import CapacitorBridge from '@/components/CapacitorBridge'
import PushRegistration from '@/components/PushRegistration'
import SwipeBack from '@/components/SwipeBack'
import AndroidBackButton from '@/components/AndroidBackButton'
import NeighborhoodTravelOverlay from '@/components/NeighborhoodTravelOverlay'
import { ConfirmProvider } from '@/components/ConfirmProvider'
import ScrollReset from '@/components/ScrollReset'
import { LangProvider } from '@/hooks/useLanguage'
import { checkEnvironment } from '@/lib/env-check'
import type { Lang } from '@/lib/i18n'
import './globals.css'

// Run environment safety check once on server startup
checkEnvironment()

export const metadata: Metadata = {
  title: 'حي | Hai',
  description: 'منصة الحي - تواصل مع جيرانك بشكل منظم وآمن',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'حي',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#15803d',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = cookies()
  const langCookie = cookieStore.get('hai_language')?.value
  const lang: Lang = langCookie === 'en' ? 'en' : langCookie === 'ur' ? 'ur' : 'ar'

  return (
    <html lang={lang} dir={lang === 'en' ? 'ltr' : 'rtl'} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  try {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    function applyTheme() {
      var th = localStorage.getItem('hai_theme') || 'system';
      var isDark = th === 'dark' || (th === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', isDark);
    }
    applyTheme();
    mq.addEventListener('change', applyTheme);
    var l = localStorage.getItem('hai_language') || 'ar';
    document.documentElement.setAttribute('lang', l);
    document.documentElement.setAttribute('dir', l === 'en' ? 'ltr' : 'rtl');
    if (window.history) window.history.scrollRestoration = 'manual';
  } catch(e) {}
})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        {/* Opaque cover over the iOS status-bar / dynamic-island area so the
            body's scroll doesn't reveal content behind it. A real fixed DOM
            node paints reliably across WKWebView versions where html::before
            pseudo-elements sometimes don't. Height tracks env(safe-area-inset-top). */}
        <div id="__hai_safe_top" aria-hidden style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          height: 'env(safe-area-inset-top, 0px)',
          zIndex: 10000, pointerEvents: 'none',
          background: 'var(--bg)',
        }} />
        {/* Blank cover — prevents content flash before AppSplash renders */}
        <div id="__hai_preload" style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'radial-gradient(ellipse at 50% 42%, #e8f5e9 0%, #f0fdf4 40%, #fff 100%)',
        }} />
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var d = document.documentElement.classList.contains('dark');
            if (d) {
              var el = document.getElementById('__hai_preload');
              if (el) el.style.background = 'radial-gradient(ellipse at 50% 42%, #0d2818 0%, #0f1a14 40%, #0a0f0c 100%)';
            }
          })();
        `}} />
        <AppSplash />
        <CapacitorBridge />
        <PushRegistration />
        <LangProvider initialLang={lang}>
          <ConfirmProvider>
          <Toaster
            position="top-center"
            containerStyle={{ top: 'env(safe-area-inset-top, 0px)' }}
            gutter={8}
            toastOptions={{
              style: {
                fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, system-ui, sans-serif',
                marginTop: 'env(safe-area-inset-top, 0px)',
              },
              duration: 3000,
            }}
          />
          <SwipeBack />
          <AndroidBackButton />
          <NeighborhoodTravelOverlay />
          <RepToast />
          <ErrorBoundary>
              <div
                id="__hai_scroll"
                style={{
                  height: '100dvh',
                  overflowY: 'scroll',
                  WebkitOverflowScrolling: 'touch' as any,
                }}
              >
                {children}
              </div>
          </ErrorBoundary>
          <ScrollReset />
          <ArrivalAlert />
          <RouteTransition />
          </ConfirmProvider>
        </LangProvider>
      </body>
    </html>
  )
}

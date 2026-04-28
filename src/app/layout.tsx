import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { Toaster } from 'react-hot-toast'
import RepToast from '@/components/RepToast'
import ErrorBoundary from '@/components/ErrorBoundary'
import AppSplash from '@/components/AppSplash'
import RouteTransition from '@/components/RouteTransition'
import BottomNav from '@/components/BottomNav'
import ArrivalAlert from '@/components/ArrivalAlert'
import CapacitorBridge from '@/components/CapacitorBridge'
import PushRegistration from '@/components/PushRegistration'
import SwipeBack from '@/components/SwipeBack'
import AndroidBackButton from '@/components/AndroidBackButton'
import NeighborhoodTravelOverlay from '@/components/NeighborhoodTravelOverlay'
import { ConfirmProvider } from '@/components/ConfirmProvider'
import ScrollReset from '@/components/ScrollReset'
import PullToRefresh from '@/components/PullToRefresh'
import { LangProvider } from '@/hooks/useLanguage'
import { NetworkProvider } from '@/lib/network'
import OfflineBanner from '@/components/OfflineBanner'
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
  // Cache-bust query (?v=…) appended to every icon URL. Browsers
  // and Android home-screen launchers aggressively cache favicons,
  // and without a unique URL the previous icon design lingers
  // forever. Bump the version when the icon art changes so a new
  // URL forces a refetch.
  icons: {
    icon: [
      { url: '/icon-192.png?v=2026-04-25', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png?v=2026-04-25', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icon-192.png?v=2026-04-25',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#006d57',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = cookies()
  const langCookie = cookieStore.get('hai_language')?.value
  const lang: Lang = langCookie === 'en' ? 'en' : langCookie === 'ur' ? 'ur' : 'ar'

  // Theme cookie is the authoritative source for SSR — 'dark' or 'light'
  // means the user picked manually; 'system' (or missing) means follow
  // the OS. Applying the class here on the server avoids the Android
  // WebView bug where localStorage hydrates after the head script runs
  // and the wrong theme flashes in.
  const themeCookie = cookieStore.get('hai_theme')?.value
  const serverIsDark = themeCookie === 'dark'

  return (
    <html
      lang={lang}
      dir={lang === 'en' ? 'ltr' : 'rtl'}
      className={serverIsDark ? 'dark' : undefined}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="color-scheme" content="light dark" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  try {
    // Cookie is the primary source of truth — it survives WebView
    // cold-restart earlier than localStorage on Android and is also
    // set server-side. localStorage is a secondary fallback.
    function readCookie(name) {
      var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    }
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    function applyTheme() {
      var th = readCookie('hai_theme');
      if (!th) { try { th = localStorage.getItem('hai_theme'); } catch(_){} }
      if (!th) th = 'system';
      var isDark = th === 'dark' || (th === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', isDark);
    }
    applyTheme();
    // Only listen to OS changes when the user has NOT picked manually.
    // If they picked dark/light, the OS shouldn't override their choice.
    mq.addEventListener('change', function(){
      var th = readCookie('hai_theme');
      if (!th) { try { th = localStorage.getItem('hai_theme'); } catch(_){} }
      if (!th || th === 'system') applyTheme();
    });
    var l = readCookie('hai_language');
    if (!l) { try { l = localStorage.getItem('hai_language'); } catch(_){} }
    if (!l) l = 'ar';
    document.documentElement.setAttribute('lang', l);
    document.documentElement.setAttribute('dir', l === 'en' ? 'ltr' : 'rtl');
    if (window.history) window.history.scrollRestoration = 'manual';
  } catch(e) {}
})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        {/* Blank cover — matches AppSplash's background gradient exactly
            so the handoff from native launch storyboard → preload → JS
            AppSplash shows no color flash. No logo or text here; the
            animated AppSplash is the only visible intro. */}
        <div id="__hai_preload" style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0, left: 0,
          minWidth: '100%', minHeight: '100%',
          zIndex: 99999,
          background: serverIsDark
            ? 'radial-gradient(ellipse at 50% 42%, #101619 0%, #070b0d 40%, #000000 100%)'
            : 'radial-gradient(ellipse at 50% 42%, #e8f5e9 0%, #e0f7f2 40%, #fff 100%)',
        }} />
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var d = document.documentElement.classList.contains('dark');
            if (d) {
              var el = document.getElementById('__hai_preload');
              if (el) el.style.background = 'radial-gradient(ellipse at 50% 42%, #101619 0%, #070b0d 40%, #000000 100%)';
            }
          })();
        `}} />
        <AppSplash />
        <CapacitorBridge />
        <PushRegistration />
        <LangProvider initialLang={lang}>
          <NetworkProvider>
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
              {children}
          </ErrorBoundary>
          {/* Global bottom tab bar — mounted ONCE here so it lives
              outside src/app/template.tsx's animated wrapper. That
              matters because template.tsx uses a CSS transform during
              route transitions, and a transformed ancestor would
              otherwise re-anchor position:fixed children (like the
              BottomNav) to the wrapper instead of the viewport. The
              component hides itself on routes that shouldn't have a
              bottom tab (auth pages, detail screens, etc). */}
          <BottomNav />
          <ScrollReset />
          <PullToRefresh />
          <ArrivalAlert />
          <RouteTransition />
          {/* Offline banner — mounted last so its z-index sits above
              the rest of the chrome but below sheets/modals. */}
          <OfflineBanner />
          </ConfirmProvider>
          </NetworkProvider>
        </LangProvider>
      </body>
    </html>
  )
}

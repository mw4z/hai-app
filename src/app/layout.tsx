import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { Toaster } from 'react-hot-toast'
import RepToast from '@/components/RepToast'
import ErrorBoundary from '@/components/ErrorBoundary'
// AppSplash removed — the native iOS storyboard + Capacitor
// SplashScreen plugin are now the ONLY splash layer (see
// capacitor.config.ts SplashScreen.launchAutoHide:false and
// CapacitorBridge for the hide trigger). Running a second JS
// splash on top was the source of the "show / hide / show /
// hide" flicker on cold-start share-link deeplinks.
import RouteTransition from '@/components/RouteTransition'
import BottomNav from '@/components/BottomNav'
import ArrivalAlert from '@/components/ArrivalAlert'
import CapacitorBridge from '@/components/CapacitorBridge'
// SwUpdateReload removed — the auto-page-reload on service-worker
// activation was eating cold-start deeplinks (Square push taps,
// share-link "highlight" effect, "splash shows twice" report) and
// the visible mid-session reload felt cheap. Updates now land on
// the next natural app restart instead — acceptable for a Capacitor-
// wrapped remote app where users foreground/background frequently.
import CropHost from '@/components/CropHost'
import DebugOverlay from '@/components/DebugOverlay'
import PushRegistration from '@/components/PushRegistration'
import NotificationPermissionNudge from '@/components/NotificationPermissionNudge'
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
import 'react-image-crop/dist/ReactCrop.css'

// Run environment safety check once on server startup
checkEnvironment()

export const metadata: Metadata = {
  // Resolve relative og:image / og:url paths against the production
  // domain instead of the request host. Without this, link previews on
  // WhatsApp / Twitter / iMessage land on a relative URL the crawler
  // can't resolve, and the unfurl falls back to the bare domain text.
  // Reads NEXT_PUBLIC_BASE_URL so previews still resolve correctly on
  // Vercel preview deploys.
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://app.hai-app.net'),
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
        {/* Initial value gets immediately overwritten by applyTheme()
            below — fine; iOS only reads it when the keyboard is about
            to come up, not at page-load. Kept here so the tag exists
            in markup before JS runs. */}
        <meta name="color-scheme" content="light" />
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
    // Sync the <meta name="color-scheme"> content to match the
    // app's resolved theme. iOS WKWebView reads this tag to decide
    // the keyboard appearance; setting it to "light dark" lets iOS
    // fall back to the OS trait collection (= dark keyboard when
    // iOS is in Dark Mode, regardless of our app theme — the bug
    // users were reporting). Pinning it to a single value keeps
    // the keyboard locked to the app's theme.
    function setMetaColorScheme(isDark) {
      var meta = document.querySelector('meta[name="color-scheme"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'color-scheme');
        document.head.appendChild(meta);
      }
      var next = isDark ? 'dark' : 'light';
      if (meta.getAttribute('content') !== next) meta.setAttribute('content', next);
    }
    function applyTheme() {
      var th = readCookie('hai_theme');
      if (!th) { try { th = localStorage.getItem('hai_theme'); } catch(_){} }
      if (!th) th = 'system';
      var isDark = th === 'dark' || (th === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', isDark);
      setMetaColorScheme(isDark);
    }
    applyTheme();
    // Whenever html.dark is toggled by anyone (CapacitorBridge
    // resume, ProfileClient picker, system-mode mq listener), keep
    // the meta tag synced. This is the canonical sync point.
    new MutationObserver(function() {
      setMetaColorScheme(document.documentElement.classList.contains('dark'));
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
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
        {/* No HTML/CSS splash overlay here. On native, the iOS
            storyboard + Capacitor SplashScreen plugin cover the
            screen until CapacitorBridge hides them — there's no
            uncovered moment where a gradient cover would matter.
            On web there's no splash at all; the page just renders. */}
        <CapacitorBridge />
        <DebugOverlay />
        <PushRegistration />
        <NotificationPermissionNudge />
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
          {/* Global crop-before-upload editor — renders over everything when
              a picked image is awaiting crop (see lib/cropBridge). */}
          <CropHost />
          </ConfirmProvider>
          </NetworkProvider>
        </LangProvider>
      </body>
    </html>
  )
}

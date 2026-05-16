import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hai.app',
  appName: 'حي',
  webDir: 'out',
  server: {
    url: 'https://app.hai-app.net',
    // No cleartext — production server is HTTPS, and allowing HTTP
    // would let a MITM on public WiFi serve a fake response on cold-
    // start (audit M-6). Capacitor's offline fallback below is loaded
    // from the local file system (webDir), not over HTTP, so this
    // doesn't affect the offline path.
    cleartext: false,
    // Bundled offline fallback — when the remote app fails to load
    // on cold-start (no internet, captive portal, server outage),
    // Capacitor serves this local file from the webDir instead of
    // showing a white screen. The page polls /api/ping and auto-
    // reloads to the live app the moment connectivity returns.
    errorPath: 'offline.html',
  },
  appendUserAgent: 'HaiNativeApp',
  android: {
    // Refuse HTTP resources from an HTTPS origin (audit M-6). All blob
    // URLs and image CDNs we use are HTTPS, so this doesn't break
    // anything; without it, a MITM on public WiFi could inject scripts
    // or images by intercepting the HTTP fallback path.
    allowMixedContent: false,
    // Matches --hai-bg in dark mode (src/app/design-tokens.css)
    // so the native Android window behind the webview is the same
    // as the app body (no seam in the safe-area / notch).
    backgroundColor: '#19232a',
  },
  plugins: {
    SplashScreen: {
      // Hide the Capacitor native splash immediately on launch. The
      // native launch storyboard (branded "حي") stays up until the JS
      // AppSplash is ready, so we don't need a second native splash
      // layer in between.
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#e0f7f2',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // Dark icons/text — correct for light mode (the common case).
      // CapacitorBridge flips to light icons at runtime when the app
      // is in dark mode.
      style: 'DARK',
      // Transparent so the webview paints the safe-area region itself
      // (via body / body::before / .hai-screen background). Prevents a
      // colored band appearing on top of the app while the native
      // bridge is still booting.
      backgroundColor: '#00000000',
      // Let the webview extend under the status bar from the first
      // frame; CapacitorBridge already sets this at runtime, so starting
      // here avoids the layout shift when the override kicks in.
      overlaysWebView: true,
    },
  },
};

export default config;

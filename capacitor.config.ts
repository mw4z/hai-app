import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hai.app',
  appName: 'حي',
  webDir: 'out',
  server: {
    url: 'https://app.hai-app.net',
    cleartext: true,
  },
  appendUserAgent: 'HaiNativeApp',
  android: {
    allowMixedContent: true,
    // Matches --hai-bg in dark mode (src/app/design-tokens.css) so the
    // native Android window behind the webview is the same navy as the
    // app body — no slate-vs-navy seam visible in the safe-area / notch.
    backgroundColor: '#0b1222',
  },
  plugins: {
    SplashScreen: {
      // Hide the Capacitor native splash immediately on launch. The
      // native launch storyboard (branded "حي") stays up until the JS
      // AppSplash is ready, so we don't need a second native splash
      // layer in between.
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#f0fdf4',
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
      // Match the launch storyboard + preload div background so there's
      // no dark flash behind the status bar while the bridge is still
      // booting.
      backgroundColor: '#f0fdf4',
      // Let the webview extend under the status bar from the first
      // frame; CapacitorBridge already sets this at runtime, so starting
      // here avoids the layout shift when the override kicks in.
      overlaysWebView: true,
    },
  },
};

export default config;

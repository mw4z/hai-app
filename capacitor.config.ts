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
    backgroundColor: '#0f172a',
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
      style: 'DARK',
      backgroundColor: '#0f172a',
      overlaysWebView: false,
    },
  },
};

export default config;

package com.hai.app;

import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int LIGHT_COLOR = Color.WHITE;
    private static final String OFFLINE_URL = "file:///android_asset/public/offline.html";
    private static final String REMOTE_URL = "https://app.hai-app.net";

    // True while we've explicitly redirected the WebView to the bundled
    // offline page. Prevents the WebViewClient from looping if the
    // offline page itself somehow fails to load.
    private boolean showingOfflineFallback = false;
    // Cold launch (especially from a tapped notification) often fails the
    // FIRST load because the radio isn't up yet. Retry the remote URL a
    // couple of times before falling back to the offline page, so that
    // screen doesn't flash for a second or two on every cold start.
    private int loadRetries = 0;
    private static final int MAX_LOAD_RETRIES = 2;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyBars();

        // Lock phones to portrait in CODE rather than the manifest: Android 16
        // ignores manifest orientation locks on large screens and Play flags
        // them, but the UI is phone-first portrait. Tablets / foldables
        // (>=600dp smallest width) are left free to rotate.
        if (getResources().getConfiguration().smallestScreenWidthDp < 600) {
            setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }

        try {
            WebView wv = getBridge().getWebView();
            wv.setBackgroundColor(isDarkMode() ? Color.BLACK : LIGHT_COLOR);
            wv.setLayerType(View.LAYER_TYPE_HARDWARE, null);
            // Default Android over-scroll: shows the stretch effect on
            // Android 12+ (or the older "glow" on earlier versions)
            // when the user pulls past the top/bottom of a scrollable
            // page. Previously OVER_SCROLL_NEVER, which made every
            // main-screen scroll feel inert next to the comments
            // sheet (its inner scroll container has its own native
            // overscroll behaviour that this flag doesn't touch).
            wv.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
            WebSettings ws = wv.getSettings();
            ws.setCacheMode(WebSettings.LOAD_DEFAULT);
            ws.setDomStorageEnabled(true);
            ws.setRenderPriority(WebSettings.RenderPriority.HIGH);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
            }
            // Make prefers-color-scheme reflect the OS setting. Many OEM
            // WebViews (Samsung, Xiaomi, Huawei) default to "light" for
            // the media query regardless of system dark mode — this flag
            // opts the WebView into honoring the system value without
            // auto-inverting page colors (our app has its own dark CSS).
            if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                try { WebSettingsCompat.setAlgorithmicDarkeningAllowed(ws, true); } catch (Exception ignored) {}
            }

            // Bulletproof offline fallback. Capacitor's server.errorPath
            // sometimes doesn't fire on net::ERR_INTERNET_DISCONNECTED
            // (cold-start with no radio). Wrap the existing WebViewClient
            // so any main-frame load failure for the remote URL triggers
            // an immediate load of the bundled offline page. White screens
            // become a real, retry-able UI.
            final WebViewClient existingClient = wv.getWebViewClient();
            wv.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageStarted(WebView view, String url, Bitmap favicon) {
                    // If a remote-origin URL starts loading, we're no
                    // longer "stuck offline" — clear the flag so a new
                    // failure can re-trigger the fallback.
                    if (url != null && url.startsWith(REMOTE_URL)) {
                        showingOfflineFallback = false;
                    }
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                    // Only act on main-frame failures of the remote URL —
                    // ignore subresource (image, script) failures and
                    // failures of the offline page itself.
                    if (req == null || !req.isForMainFrame()) return;
                    final String failed = req.getUrl() == null ? "" : req.getUrl().toString();
                    if (showingOfflineFallback) return;
                    if (!failed.startsWith(REMOTE_URL)) return;
                    // Cold-start grace: the radio is usually up within ~1-2s.
                    // Retry the load before showing the offline page so it
                    // doesn't flash on every launch-from-notification.
                    if (loadRetries < MAX_LOAD_RETRIES) {
                        loadRetries++;
                        view.stopLoading();
                        view.postDelayed(() -> {
                            try { view.loadUrl(failed); } catch (Exception ignored) {}
                        }, loadRetries * 700L);
                        return;
                    }
                    showingOfflineFallback = true;
                    view.stopLoading();
                    view.loadUrl(OFFLINE_URL);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    // A successful remote load resets the retry budget.
                    if (url != null && url.startsWith(REMOTE_URL)) loadRetries = 0;
                }

                @Override
                public void onReceivedHttpError(WebView view, WebResourceRequest req,
                                                android.webkit.WebResourceResponse resp) {
                    // 5xx on the main document = remote app is down.
                    // Same recovery path as a network error.
                    if (req == null || !req.isForMainFrame()) return;
                    if (showingOfflineFallback) return;
                    if (resp == null || resp.getStatusCode() < 500) return;
                    String failed = req.getUrl() == null ? "" : req.getUrl().toString();
                    if (!failed.startsWith(REMOTE_URL)) return;
                    showingOfflineFallback = true;
                    view.stopLoading();
                    view.loadUrl(OFFLINE_URL);
                }
            });

            // Auto-recover: when connectivity comes back AND we're stuck
            // on the offline page, navigate back to the live app on the
            // UI thread. Saves the user a manual "Try again" tap when
            // they reopen the radio after a tunnel / airplane mode.
            try {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
                if (cm != null) {
                    NetworkRequest request = new NetworkRequest.Builder()
                        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        .build();
                    cm.registerNetworkCallback(request, new ConnectivityManager.NetworkCallback() {
                        @Override
                        public void onAvailable(Network network) {
                            runOnUiThread(() -> {
                                if (showingOfflineFallback) {
                                    showingOfflineFallback = false;
                                    try {
                                        WebView w = getBridge().getWebView();
                                        if (w != null) w.loadUrl(REMOTE_URL);
                                    } catch (Exception ignored) {}
                                }
                            });
                        }
                    });
                }
            } catch (Exception ignored) {}
        } catch (Exception e) {}
    }

    @Override
    public void onResume() {
        super.onResume();
        applyBars();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyBars();
    }

    private boolean isDarkMode() {
        int nightMode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return nightMode == Configuration.UI_MODE_NIGHT_YES;
    }

    private void applyBars() {
        Window window = getWindow();
        boolean dark = isDarkMode();

        // Edge-to-edge: the WebView draws behind the system bars, so the
        // deprecated setStatusBarColor / setNavigationBarColor (deprecated in
        // Android 15) are unnecessary — the content paints over the bar
        // background anyway. Bar ICON contrast is still set below via the
        // modern WindowInsetsControllerCompat API.
        WindowCompat.setDecorFitsSystemWindows(window, false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }

        // Modern API (Android 8+)
        try {
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(!dark);
            controller.setAppearanceLightNavigationBars(!dark);
        } catch (Exception e) {
            // Fallback for older devices (Note 8 etc)
            View decorView = window.getDecorView();
            int flags = decorView.getSystemUiVisibility();
            if (!dark) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                }
            } else {
                flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                }
            }
            decorView.setSystemUiVisibility(flags);
        }
    }
}

package com.hai.app;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int DARK_COLOR = Color.parseColor("#0f172a");
    private static final int LIGHT_COLOR = Color.WHITE;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyBars();

        try {
            WebView wv = getBridge().getWebView();
            wv.setBackgroundColor(isDarkMode() ? Color.BLACK : LIGHT_COLOR);
            wv.setLayerType(View.LAYER_TYPE_HARDWARE, null);
            wv.setOverScrollMode(View.OVER_SCROLL_NEVER);
            WebSettings ws = wv.getSettings();
            ws.setCacheMode(WebSettings.LOAD_DEFAULT);
            ws.setDomStorageEnabled(true);
            ws.setRenderPriority(WebSettings.RenderPriority.HIGH);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
            }
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
        int barColor = dark ? DARK_COLOR : LIGHT_COLOR;

        // Top: system handles status bar. Bottom: app draws behind nav bar.
        window.setStatusBarColor(barColor);
        window.setNavigationBarColor(Color.TRANSPARENT);
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

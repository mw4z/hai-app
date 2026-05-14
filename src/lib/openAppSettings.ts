/**
 * Open the platform's settings screen for this app — preferring
 * the notification panel where the OS lets us deeplink to it.
 *
 * Used by NotificationPermissionNudge when the user taps
 * "تفعيل التنبيهات" and the current permission is denied (in
 * that state we can't re-prompt — only the user can change it
 * in OS settings).
 *
 * Android: deep-links directly to the app's notification settings
 * (Settings → Apps → Hai → Notifications). This is the most
 * useful landing page because the user gets one tap to flip the
 * master switch.
 *
 * iOS: lands on the app's main settings page. iOS does not have
 * a stable public deeplink to the in-app Notifications panel
 * within Settings.app — the closest options are private (and
 * App Review will reject). The app-level page does include a
 * "Notifications" row near the top, so it's still one tap away.
 *
 * Web: no-op. The caller (NotificationPermissionNudge) gates on
 * native platform before calling this, so we never get here on
 * web — guarded defensively anyway.
 */
export async function openNotificationSettings(): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false
    const cap = window.Capacitor
    if (!cap?.isNativePlatform()) return false

    const { NativeSettings, AndroidSettings, IOSSettings } = await import(
      'capacitor-native-settings'
    )

    const platform = cap.getPlatform()
    if (platform === 'android') {
      try {
        await NativeSettings.openAndroid({
          option: AndroidSettings.AppNotification,
        })
        return true
      } catch {
        // Fall back to the generic app-details page on devices /
        // OEM ROMs that don't expose the dedicated notification
        // panel intent.
        await NativeSettings.openAndroid({
          option: AndroidSettings.ApplicationDetails,
        })
        return true
      }
    }

    if (platform === 'ios') {
      await NativeSettings.openIOS({ option: IOSSettings.App })
      return true
    }

    return false
  } catch (err) {
    console.error('[openNotificationSettings] failed:', err)
    return false
  }
}

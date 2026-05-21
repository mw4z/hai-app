/**
 * Open an external URL/scheme reliably from a Capacitor WebView.
 *
 * The bug this fixes: on Android, `window.open('tel:…')` / `window.open(
 * 'https://wa.me/…','_blank')` route through the WebView's own URL
 * handling (onCreateWindow / shouldOverrideUrlLoading). Non-http schemes
 * like `tel:` and `whatsapp://` — and `wa.me`'s redirect TO `whatsapp://`
 * — end up trying to LOAD inside the WebView, which can't, so the user
 * sees "webpage not available" instead of the dialer / WhatsApp.
 *
 * Fix: go through the native plugin layer, which issues a real Android
 * Intent (or iOS open) and never touches the WebView:
 *   - non-http schemes (tel:, whatsapp://, mailto:, sms:, geo:) → AppLauncher
 *   - http(s) → in-app Custom Tab via Browser (also hands off to the
 *     target app through Android App Links / iOS Universal Links)
 * On the web build, plain window.open.
 */

function isNative(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as any).Capacitor?.isNativePlatform?.() === true
  )
}

export async function openExternal(url: string): Promise<void> {
  if (typeof window === 'undefined' || !url) return
  const isHttp = /^https?:\/\//i.test(url)

  if (isNative()) {
    if (!isHttp) {
      // tel: / whatsapp:// / mailto: / sms: / geo: → native Intent.
      try {
        const { AppLauncher } = await import('@capacitor/app-launcher')
        await AppLauncher.openUrl({ url })
        return
      } catch {
        /* fall through to window.open */
      }
    } else {
      // http(s) → Custom Tab overlay; never navigates the main WebView,
      // and App Links route it to the installed app (e.g. WhatsApp).
      try {
        const { Browser } = await import('@capacitor/browser')
        await Browser.open({ url })
        return
      } catch {
        /* fall through */
      }
    }
  }

  try {
    if (isHttp) {
      window.open(url, '_blank')
    } else {
      // Non-http scheme (tel:, mailto:, sms:, geo:): a DIRECT location
      // change is intercepted by Capacitor's WebViewClient
      // (shouldOverrideUrlLoading → native ACTION_VIEW Intent → dialer).
      // window.open routed through the WebView popup path
      // (onCreateWindow) and showed the "webpage not available" error
      // page instead — that was the bug. This fallback makes Call work
      // even on binaries that don't yet bundle @capacitor/app-launcher.
      window.location.href = url
    }
  } catch {
    /* ignore */
  }
}

/**
 * Place a phone call. Native: AppLauncher opens the dialer via Intent.
 * Web: tel: navigation (the desktop/mobile browser handles it).
 */
export function callPhone(phone: string): Promise<void> {
  const clean = phone.replace(/[^\d+]/g, '')
  return openExternal(`tel:${clean}`)
}

/**
 * Open a WhatsApp chat. Uses the wa.me https link so a Custom Tab can
 * hand off to the WhatsApp app (or open web WhatsApp if not installed),
 * which is more reliable than the whatsapp:// scheme when the app is
 * missing. `intlDigits` must be country-code + number, no `+` / spaces.
 */
export function openWhatsApp(intlDigits: string): Promise<void> {
  const h = intlDigits.replace(/[^\d]/g, '')
  return openExternal(`https://wa.me/${h}`)
}

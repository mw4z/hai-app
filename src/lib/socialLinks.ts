/**
 * Social-media deep linking for service-provider profiles.
 *
 * For each platform we store a single canonical handle (or phone for
 * WhatsApp) and derive two URLs at render time:
 *   - app: custom-scheme URL the installed app registers
 *          (e.g. `instagram://user?username=X`). Tapping it fires the
 *          intent; if the app is installed the OS hands the link over
 *          and the app opens to the profile.
 *   - web: HTTPS fallback that works on desktop AND on mobile without
 *          the app installed. Most of these URLs are also registered
 *          as Universal Links / App Links, so on a phone with the
 *          app installed tapping the web URL ALSO opens the app —
 *          which is why we race the two: try app scheme first, fall
 *          back to web if nothing happens.
 *
 * Import `openSocial()` client-side to get the race behavior for free.
 */

export type SocialPlatform = 'instagram' | 'tiktok' | 'x' | 'snapchat' | 'whatsapp'

export type SocialLinks = Partial<Record<SocialPlatform, string>>

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  'instagram',
  'tiktok',
  'x',
  'snapchat',
  'whatsapp',
]

/**
 * Strip whitespace, leading @, and any copy-pasted URL wrapping so the
 * stored handle is always the raw identifier. Returns null for empty
 * or clearly-invalid input.
 */
export function normalizeHandle(platform: SocialPlatform, raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let s = raw.trim()
  if (!s) return null

  // Strip protocol + common host prefixes so users can paste full URLs.
  s = s.replace(/^https?:\/\//i, '')
  s = s.replace(/^(www\.)?(instagram\.com|tiktok\.com|x\.com|twitter\.com|snapchat\.com|wa\.me|whatsapp\.com)\/?/i, '')
  // Strip TikTok/Instagram extras
  s = s.replace(/^@/, '')
  s = s.replace(/\?.*$/, '') // drop query strings
  s = s.replace(/\/+$/, '')  // trailing slashes

  if (platform === 'whatsapp') {
    // Strip everything except digits. Leading + is ignored since the
    // stored form is always the international number WITHOUT + (that's
    // what wa.me expects).
    let digits = s.replace(/\D/g, '')
    if (!digits) return null

    // Saudi-first normalization so residents can paste any local
    // format and the viewer-side wa.me link still routes correctly:
    //   05xxxxxxxx   (10 digits, 0 prefix)   → 9665xxxxxxxx
    //   5xxxxxxxx    (9 digits, no prefix)   → 9665xxxxxxxx
    //   9665xxxxxxxx (12 digits, country)    → kept as-is
    //   00966…       (E.164 with 00)         → stripped to 966…
    // Any other country code is kept verbatim (already international).
    if (digits.startsWith('00')) digits = digits.slice(2)
    if (digits.length === 10 && digits.startsWith('05')) {
      digits = '966' + digits.slice(1)
    } else if (digits.length === 9 && digits.startsWith('5')) {
      digits = '966' + digits
    }

    if (digits.length < 8 || digits.length > 15) return null
    return digits
  }

  if (platform === 'tiktok') {
    // @handle or /@handle paths
    s = s.replace(/^(add\/|@)/i, '')
  }

  if (platform === 'snapchat') {
    s = s.replace(/^add\//i, '')
  }

  // Allowed handle chars: letters, digits, underscore, dot
  if (!/^[A-Za-z0-9._]{1,40}$/.test(s)) return null
  return s
}

/**
 * Sanitise and validate an incoming SocialLinks object (e.g. from a
 * profile PATCH body). Returns a clean object with only valid
 * platforms/values; invalid entries are dropped silently so a single
 * malformed handle doesn't fail the whole update.
 */
export function sanitizeSocialLinks(input: unknown): SocialLinks {
  if (!input || typeof input !== 'object') return {}
  const out: SocialLinks = {}
  for (const p of SOCIAL_PLATFORMS) {
    const v = (input as Record<string, unknown>)[p]
    const clean = normalizeHandle(p, v)
    if (clean) out[p] = clean
  }
  return out
}

/** App scheme + HTTPS fallback for a given handle. */
export function buildSocialUrls(platform: SocialPlatform, handle: string): { app: string; web: string } {
  const h = encodeURIComponent(handle)
  switch (platform) {
    case 'instagram':
      return { app: `instagram://user?username=${h}`,           web: `https://instagram.com/${h}` }
    case 'tiktok':
      return { app: `snssdk1233://user/profile/${h}`,           web: `https://www.tiktok.com/@${h}` }
    case 'x':
      return { app: `twitter://user?screen_name=${h}`,          web: `https://x.com/${h}` }
    case 'snapchat':
      return { app: `snapchat://add/${h}`,                      web: `https://snapchat.com/add/${h}` }
    case 'whatsapp':
      return { app: `whatsapp://send?phone=${h}`,               web: `https://wa.me/${h}` }
  }
}

/**
 * Open a provider's social profile.
 *
 * On native: uses @capacitor/browser to launch an in-app overlay
 * (Chrome Custom Tabs on Android, SFSafariViewController on iOS).
 * The main WebView is NEVER navigated, so the profile popup and all
 * React state stay intact when the user dismisses the overlay.
 * Chrome Custom Tabs also respects Android App Links — the link is
 * handed off to the Instagram/TikTok/etc. app automatically if
 * installed.
 *
 * On web: plain window.open in a new tab. Browsers Universal-Link
 * mobile web triggers the app too.
 *
 * Previously used <a target="_blank">, which on Capacitor WebView
 * (with a remote server.url) could navigate the main window — the
 * popup state was lost on "back" because the WebView had unwound
 * the page.
 */
export async function openSocial(platform: SocialPlatform, handle: string): Promise<void> {
  if (typeof window === 'undefined') return
  const { web } = buildSocialUrls(platform, handle)

  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (cap?.isNativePlatform?.()) {
    try {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url: web, presentationStyle: 'popover' })
      return
    } catch (err) {
      console.error('[SOCIAL] Browser.open failed', err)
      // Fall through to web fallback.
    }
  }

  // Match the exact signature that ContactChip's WhatsApp button uses
  // (no noopener). With `noopener` some Capacitor WebView builds
  // navigate the main window instead of opening a new one, which
  // caused the popup to tear down on return from Instagram.
  try { window.open(web, '_blank') } catch { /* ignore */ }
}

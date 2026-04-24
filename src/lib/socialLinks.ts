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
    // Keep digits + leading +; drop formatting
    const digits = s.replace(/[^\d+]/g, '')
    if (!digits) return null
    if (digits.length < 7 || digits.length > 16) return null
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
 * Imperative open (fallback for code that can't render an <a>). The
 * viewer itself now uses plain <a target="_blank"> (see SocialChips)
 * because Universal Links / App Links on modern iOS/Android already
 * route these HTTPS URLs to the installed app — no custom scheme
 * trick needed, and no risk of navigating the Capacitor WebView or
 * losing popup state.
 */
export function openSocial(platform: SocialPlatform, handle: string): void {
  if (typeof window === 'undefined') return
  const { web } = buildSocialUrls(platform, handle)
  try { window.open(web, '_blank', 'noopener') } catch { /* ignore */ }
}

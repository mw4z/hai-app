/**
 * Contact picker — opens the native contact picker (iOS/Android via
 * @capacitor-community/contacts) and returns a compact { name, phone }
 * snippet ready to paste into a comment or chat message.
 *
 * On web it falls back to the standard Contact Picker API when the
 * browser supports it (Chromium on Android), otherwise returns null.
 */

type PickedContact = { name: string; phone: string } | null

function isNative(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()
}

function normalizePhone(raw: string): string {
  // Strip everything except digits and leading +. Keep it readable.
  const trimmed = (raw || '').trim()
  if (!trimmed) return ''
  const plus = trimmed.startsWith('+') ? '+' : ''
  const digits = trimmed.replace(/[^\d]/g, '')
  return plus + digits
}

function pickBestPhone(phones: Array<{ number?: string | null } | null | undefined> | null | undefined): string {
  if (!phones || !phones.length) return ''
  for (const p of phones) {
    if (p?.number) return normalizePhone(p.number)
  }
  return ''
}

/**
 * Open the native contact picker. Resolves with `{ name, phone }` on
 * success, or `null` if the user cancelled / denied permission / no
 * picker is available on this platform.
 */
export async function pickContact(): Promise<PickedContact> {
  if (typeof window === 'undefined') return null

  if (isNative()) {
    try {
      const { Contacts } = await import('@capacitor-community/contacts')
      const perm = await Contacts.requestPermissions()
      if (perm.contacts !== 'granted') return null
      const result = await Contacts.pickContact({
        projection: {
          name: true,
          phones: true,
        },
      })
      const contact = (result as any)?.contact
      if (!contact) return null
      const display =
        contact.name?.display ||
        [contact.name?.given, contact.name?.family].filter(Boolean).join(' ').trim() ||
        ''
      const phone = pickBestPhone(contact.phones)
      if (!phone && !display) return null
      return { name: display, phone }
    } catch {
      return null
    }
  }

  // Web fallback — Contact Picker API (Chromium Android only).
  try {
    const nav = navigator as any
    if (nav?.contacts?.select) {
      const props = ['name', 'tel']
      const picked = await nav.contacts.select(props, { multiple: false })
      const first = Array.isArray(picked) ? picked[0] : null
      if (!first) return null
      const name = Array.isArray(first.name) ? first.name[0] || '' : first.name || ''
      const phone = Array.isArray(first.tel) ? normalizePhone(first.tel[0] || '') : normalizePhone(first.tel || '')
      if (!name && !phone) return null
      return { name: String(name), phone }
    }
  } catch {
    // fall through
  }
  return null
}

/**
 * Format a picked contact as a plain-text snippet that can be appended
 * to a comment/message body. Readable in both AR and EN renderings.
 */
export function formatContactSnippet(c: { name: string; phone: string }): string {
  const name = (c.name || '').trim()
  const phone = (c.phone || '').trim()
  if (name && phone) return `📱 ${name} — ${phone}`
  if (phone) return `📱 ${phone}`
  if (name) return `📱 ${name}`
  return ''
}

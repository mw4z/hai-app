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

function getPlatform(): string {
  return (typeof window !== 'undefined' && (window as any).Capacitor?.getPlatform?.()) || 'web'
}

function normalizePhone(raw: string): string {
  // Strip everything except digits and leading +. Keep it readable.
  const trimmed = (raw || '').trim()
  if (!trimmed) return ''
  const plus = trimmed.startsWith('+') ? '+' : ''
  const digits = trimmed.replace(/[^\d]/g, '')
  return plus + digits
}

function pickBestPhone(phones: any): string {
  if (!phones || !Array.isArray(phones) || phones.length === 0) return ''
  for (const p of phones) {
    if (!p) continue
    // Different plugins use different keys — try all known shapes
    const raw = p.number || p.value || p.phoneNumber || p.stringValue || ''
    const normalized = normalizePhone(typeof raw === 'string' ? raw : String(raw))
    if (normalized && normalized.replace(/\D/g, '').length >= 7) return normalized
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
    const platform = getPlatform()

    // iOS: use our custom HaiContacts plugin (pure Swift, SPM-compatible,
    // uses CNContactPickerViewController — no NSContactsUsageDescription
    // needed since it's a privacy-preserving system picker).
    if (platform === 'ios') {
      try {
        const { HaiContacts } = await import('hai-contacts')
        const result = await HaiContacts.pickContact()
        const contact = result?.contact
        if (!contact) return null
        const display =
          contact.name?.display ||
          [contact.name?.given, contact.name?.family].filter(Boolean).join(' ').trim() ||
          ''
        const phone = pickBestPhone(contact.phones as any)
        if (!phone && !display) return null
        return { name: display, phone }
      } catch {
        return null
      }
    }

    // Android: use @capacitor-community/contacts (linked via Gradle,
    // READ_CONTACTS declared in AndroidManifest).
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
  // A phone number is required — without one the regex won't detect the
  // snippet and it renders as plain text with no action buttons.
  if (!phone) return ''
  if (name) return `📱 ${name} — ${phone}`
  return `📱 ${phone}`
}

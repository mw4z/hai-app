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

// Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) → Western (0123456789)
function arabicToWestern(s: string): string {
  return s.replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
          .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0))
}

function normalizePhone(raw: string): string {
  if (!raw) return ''
  // Convert Arabic-Indic digits, strip invisible Unicode control chars
  const cleaned = arabicToWestern(raw)
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u00a0]/g, '')
    .trim()
  if (!cleaned) return ''
  const plus = cleaned.startsWith('+') ? '+' : ''
  const digits = cleaned.replace(/[^\d]/g, '')
  return digits.length >= 7 ? plus + digits : ''
}

function pickBestPhone(phones: any): string {
  // 1. Try standard array of phone objects
  if (Array.isArray(phones) && phones.length > 0) {
    for (const p of phones) {
      if (!p) continue
      // Try every known key shape across different plugins
      const raw = p.number || p.value || p.phoneNumber || p.stringValue ||
                  p.digits || p.phone || ''
      const normalized = normalizePhone(typeof raw === 'string' ? raw : String(raw))
      if (normalized) return normalized
    }
  }

  // 2. Brute force: stringify the entire phones object and extract any
  //    digit sequence that looks like a phone number (7+ digits). Catches
  //    weird nested structures or unexpected key names.
  try {
    const json = typeof phones === 'string' ? phones : JSON.stringify(phones)
    if (json) {
      const westernJson = arabicToWestern(json)
      const matches = westernJson.match(/\+?\d[\d\s()-]{5,}\d/g)
      if (matches) {
        for (const m of matches) {
          const normalized = normalizePhone(m)
          if (normalized) return normalized
        }
      }
    }
  } catch { /* */ }

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
        // Try phones array first, then brute-force the entire contact
        let phone = pickBestPhone(contact.phones)
        if (!phone) phone = pickBestPhone((contact as any).phoneNumbers)
        if (!phone) phone = pickBestPhone(contact)
        if (!phone && !display) return null
        return { name: display, phone }
      } catch {
        return null
      }
    }

    // Android: use @capacitor-community/contacts (linked via Gradle,
    // READ_CONTACTS declared in AndroidManifest, <queries> for the
    // PICK intent in the manifest as well — see commit bf10774).
    //
    // We do NOT gate this on requestPermissions(). pickContact() launches
    // the OS contact-picker intent, which is privacy-preserving — the
    // system grants the app one-shot access to just the contact the user
    // picks, with no need for the READ_CONTACTS runtime grant. Gating on
    // 'granted' meant a previously-denied permission silently fell
    // through to the manual name+phone prompt.
    try {
      const { Contacts } = await import('@capacitor-community/contacts')
      const result = await Contacts.pickContact({
        projection: { name: true, phones: true },
      })
      const contact = (result as any)?.contact
      if (!contact) return null
      const display =
        contact.name?.display ||
        [contact.name?.given, contact.name?.family].filter(Boolean).join(' ').trim() ||
        ''
      let phone = pickBestPhone(contact.phones)
      if (!phone) phone = pickBestPhone((contact as any).phoneNumbers)
      if (!phone) phone = pickBestPhone(contact)
      if (!phone && !display) return null
      return { name: display, phone }
    } catch (err) {
      // If the plugin throws (e.g. needs runtime READ_CONTACTS on this
      // particular device build), fall back to requesting permission
      // and retrying once before giving up.
      try {
        const { Contacts } = await import('@capacitor-community/contacts')
        const perm = await Contacts.requestPermissions()
        if (perm.contacts !== 'granted') return null
        const result = await Contacts.pickContact({
          projection: { name: true, phones: true },
        })
        const contact = (result as any)?.contact
        if (!contact) return null
        const display =
          contact.name?.display ||
          [contact.name?.given, contact.name?.family].filter(Boolean).join(' ').trim() ||
          ''
        let phone = pickBestPhone(contact.phones)
        if (!phone) phone = pickBestPhone((contact as any).phoneNumbers)
        if (!phone) phone = pickBestPhone(contact)
        if (!phone && !display) return null
        return { name: display, phone }
      } catch {
        console.warn('[contactPicker] android pickContact failed:', err)
        return null
      }
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

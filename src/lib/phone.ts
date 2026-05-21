/** Phone validation — safe to import from client components */

export function formatSaudiPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('966')) return `+${cleaned}`
  if (cleaned.startsWith('0')) return `+966${cleaned.slice(1)}`
  return `+966${cleaned}`
}

export function isValidSaudiPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '')
  return /^(0?5[0-9]{8})$/.test(cleaned)
}

/**
 * Looser validator for BUSINESS / place contact numbers. Accepts:
 *   - mobile          05xxxxxxxx / 5xxxxxxxx
 *   - toll-free 800   800xxxxxxx        (Saudi free numbers)
 *   - unified 92xx    9200xxxxx / 920… (Saudi unified business lines)
 *
 * Used for directory place phone/WhatsApp fields — a shop's listed
 * number is often an 800 or 9200 line, not a personal mobile. Do NOT
 * use this for OTP login (that must stay mobile-only — see
 * isValidSaudiPhone).
 */
export function isValidPlacePhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '')
  return /^(0?5\d{8}|800\d{6,7}|92\d{6,8})$/.test(cleaned)
}

/** Build a wa.me URL from any Saudi number format the user might
 *  have entered. wa.me requires the international form WITHOUT
 *  a leading plus or zero — pure digits starting with the country
 *  code (966 for KSA).
 *
 *  Handles every common entry shape:
 *    0512345678        → wa.me/966512345678
 *    512345678         → wa.me/966512345678
 *    +966512345678     → wa.me/966512345678
 *    00966512345678    → wa.me/966512345678
 *    966512345678      → wa.me/966512345678
 *    966-51-234-5678   → wa.me/966512345678  (dashes / spaces stripped)
 *
 *  Returns null when the input doesn't look like a Saudi number —
 *  callers should hide the WhatsApp button in that case rather than
 *  link to a broken URL.
 */
export function buildWhatsAppHref(phone: string | null | undefined): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (!digits) return null
  // 00 + country code → drop the 00
  if (digits.startsWith('00')) digits = digits.slice(2)
  // Local form "05..." → drop the leading 0 and prepend 966
  if (digits.startsWith('05')) digits = '966' + digits.slice(1)
  // Bare local "5XXXXXXXX" (9 digits, starts with 5) → prepend 966
  else if (/^5\d{8}$/.test(digits)) digits = '966' + digits
  // Already international "9665..." — leave as is
  // Anything else: trust the digits as entered (international number
  // from outside KSA, etc.) — wa.me will handle it.
  return `https://wa.me/${digits}`
}

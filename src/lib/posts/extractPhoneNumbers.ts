/**
 * Extract Saudi-ish phone numbers from arbitrary post / comment text.
 * Works with Western (0123456789), Arabic-Indic (٠١٢٣٤٥٦٧٨٩), and
 * Persian/Urdu (۰۱۲۳۴۵۶۷۸۹) digit ranges so an author can type
 * "اتصل ٠٥٠١٢٣٤٥٦٧" and the renderer still surfaces the number.
 *
 * Returns the dedup-ed list of E.164 numbers (e.g. "+9665…"). Pair with
 * toE164() / phoneHash() on the server side for directory lookups.
 *
 * Heuristic, not a parser:
 *   - Finds runs of "digit-or-separator" characters anchored by a digit
 *     on either end and at least 9 digits in total (Saudi mobiles run
 *     10 digits as "05xxxxxxxx", so 9 is the floor after the leading 0).
 *   - Discards anything toE164() can't normalize. The phoneFormat module
 *     already rejects obvious junk (random 5-digit runs, foreign codes
 *     without a +, etc.), so we trust its verdict.
 */

import { toE164 } from '@/lib/services/phoneFormat'

/** Translate Arabic-Indic + Persian-Urdu digit ranges into Western
 *  digits in-place. Safe to call on the whole post body; non-digit
 *  characters are passed through unchanged. */
export function toEnglishDigits(input: string): string {
  if (!input) return ''
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
}

/**
 * Returns dedup-ed E.164 numbers found in `text`. Order matches first-
 * appearance in the source so the renderer can stack cards in reading
 * order.
 */
export function extractPhoneNumbers(text: string | null | undefined): string[] {
  if (!text) return []
  const normalized = toEnglishDigits(String(text))
  // Anchor on a digit at both ends; allow runs of digits / spaces /
  // dashes / parens / plus / dot of length 8..20 in between. The
  // pattern is intentionally permissive — toE164 is the real filter.
  const re = /(\+?\d[\d\s\-().]{7,20}\d)/g
  const seen = new Set<string>()
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(normalized)) !== null) {
    const raw = m[1]
    const e164 = toE164(raw)
    if (!e164) continue
    if (seen.has(e164)) continue
    seen.add(e164)
    out.push(e164)
  }
  return out
}

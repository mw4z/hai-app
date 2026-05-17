/**
 * Arabic-aware text normalization for search and comparison.
 *
 * Saudi users type the same word with different glyphs all the
 * time — the same store name might be entered as "أحمد" or
 * "احمد" or "إحمد", and the same address might be saved with
 * or without tashkeel. Without normalization, ILIKE / String.
 * includes() see these as different strings.
 *
 * This helper folds the common variants so both the query and
 * the haystack compare equal:
 *
 *   - Alef family       → ا   (أ, إ, آ, ٱ, ا)
 *   - Yaa / alef maksura → ي   (ى, ي, ئ)
 *   - Taa marbuta       → ه   (ة, ه)
 *   - Wow with hamza    → و   (ؤ, و)
 *   - Tatweel           → removed (ـ)
 *   - Tashkeel marks    → removed (fatha, kasra, damma, sukun,
 *                                  shadda, tanween *3, etc.)
 *   - Arabic-Indic digits → western (٠١٢٣٤٥٦٧٨٩ → 0-9), and
 *                                   Persian-Indic too (۰۱۲۳…)
 *   - Whitespace        → single spaces, trimmed
 *   - Case              → lowercased so latin parts match too
 *
 * Use the JS export `normalizeArabic` for in-memory filtering /
 * client-side comparison. For Postgres-side queries, drop down
 * to raw SQL with `regexp_replace` + `translate`; the JS helper
 * exists so we can match the SQL output exactly when needed.
 */

// Single-char translation: every char in `from` is replaced by
// the char at the same index in `to`. Used for the 1-to-1 letter
// substitutions where regex is overkill.
const FROM = 'أإآٱىئةؤ' + '٠١٢٣٤٥٦٧٨٩' + '۰۱۲۳۴۵۶۷۸۹'
//             ←alef→ ←y→ ←taa→ ←waaw→
const TO   = 'ااااييهو' + '0123456789' + '0123456789'

// Diacritic / control marks we strip outright. Tatweel (kashida)
// is purely decorative; the eight tashkeel marks are
// pronunciation aids that don't affect the underlying word.
//   0610-061A : honorifics (e.g. صلى الله عليه وسلم glyphs)
//   064B-065F : fatha, kasra, damma, sukun, shadda, tanween…
//   0670      : superscript alef
//   06D6-06ED : Quranic annotation marks
//   0640      : tatweel
const STRIP_RE = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g

// Translation table built once at module load. Map lookup beats
// per-char indexOf for any string longer than ~5 chars.
const TRANSLATE: Record<string, string> = {}
for (let i = 0; i < FROM.length; i++) {
  TRANSLATE[FROM[i]] = TO[i]
}

/**
 * Normalize a string for Arabic-aware search comparison. Safe
 * to call on any string — non-Arabic input passes through with
 * just lowercase + whitespace collapse.
 *
 * Idempotent: normalizeArabic(normalizeArabic(s)) === normalizeArabic(s).
 */
export function normalizeArabic(input: string): string {
  if (!input) return ''
  // Pass 1: strip marks. Single regex pass.
  const stripped = input.replace(STRIP_RE, '')
  // Pass 2: char translation. Single linear walk.
  let out = ''
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i]
    out += TRANSLATE[ch] ?? ch
  }
  // Pass 3: collapse whitespace + lowercase. Lowercase matters
  // for any latin chars mixed in (e.g. brand names).
  return out.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Convenience for the common "does haystack contain needle"
 * pattern. Returns true when both sides normalize to strings
 * where the haystack includes the needle.
 *
 *   matchesArabic('مطعم أحمد', 'احمد') → true
 *   matchesArabic('Al Salam',  'سلام')  → false  (no Arabic in haystack)
 */
export function matchesArabic(haystack: string | null | undefined, needle: string): boolean {
  if (!needle) return true
  if (!haystack) return false
  return normalizeArabic(haystack).includes(normalizeArabic(needle))
}

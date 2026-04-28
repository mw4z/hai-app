/**
 * Arabic text normalization for classification.
 *
 * - Strips Arabic diacritics (tashkeel) — written posts mix shaddah/fatha
 *   inconsistently and they hurt token matching.
 * - Folds alif variants (أ إ آ ا ٱ) → ا
 * - Folds yaa variants (ي ى ئ) → ي
 * - Folds taa-marbouta (ة) → ه (common in user input; keeps "خياطة" / "خياطه" together)
 * - Folds Eastern Arabic-Indic digits (٠-٩, ۰-۹) → Western (0-9)
 * - Strips Arabic kashida (ـ — used for stretching, not meaning)
 * - Lowercases Latin chars (English brand names, etc.)
 * - Collapses internal whitespace to a single space, trims edges.
 *
 * Output is what the tokenizer + rule layer + classifier all read.
 */

const DIACRITICS = /[ً-ٰٟۖ-ۭ]/g
const KASHIDA = /ـ/g
const ALIF_VARIANTS = /[آأإٱ]/g
const YAA_VARIANTS = /[ىئ]/g
const TAA_MARBOUTA = /ة/g
const ARABIC_INDIC_DIGITS = /[٠-٩]/g
const PERSIAN_INDIC_DIGITS = /[۰-۹]/g

export function normalizeArabic(input: string): string {
  if (!input) return ''
  let s = input

  // Strip tashkeel + kashida first — they don't carry meaning here.
  s = s.replace(DIACRITICS, '')
  s = s.replace(KASHIDA, '')

  // Fold variant letterforms.
  s = s.replace(ALIF_VARIANTS, 'ا')   // → ا
  s = s.replace(YAA_VARIANTS, 'ي')    // → ي
  s = s.replace(TAA_MARBOUTA, 'ه')    // → ه

  // Convert Arabic-Indic digits → Western.
  s = s.replace(ARABIC_INDIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
  s = s.replace(PERSIAN_INDIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x06F0))

  // Lowercase Latin (Arabic letters are caseless).
  s = s.toLowerCase()

  // Collapse whitespace.
  s = s.replace(/\s+/g, ' ').trim()

  return s
}

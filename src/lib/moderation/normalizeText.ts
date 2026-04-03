/**
 * Text Normalization for profanity detection.
 * Handles Arabic diacritics, letter variants, leet speak, and bypass tricks.
 */

// Arabic diacritics (tashkeel) — Unicode range
const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g

// Tatweel (kashida) — decorative stretching character
const TATWEEL = /\u0640/g

// Arabic letter normalization map
const ARABIC_NORMALIZE: Record<string, string> = {
  'ة': 'ه',
  'ى': 'ي',
  'إ': 'ا',
  'أ': 'ا',
  'آ': 'ا',
  'ؤ': 'و',
  'ئ': 'ي',
}

// Leet speak / number-to-letter mapping (Franco-Arabic + English)
const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e', // English: 3→e, Arabic context handled separately
  '4': 'a',
  '5': 'kh', // Arabic: 5→خ
  '6': 't',  // Arabic: 6→ط
  '7': 'h',  // Arabic: 7→ح
  '8': 'q',  // Arabic: 8→ق
  '9': 's',  // Arabic: 9→ص
  '@': 'a',
  '$': 's',
  '!': 'i',
}

// Characters to strip (used to bypass filters: k*a*l*b → kalb)
const BYPASS_CHARS = /[*._\-~`'"^+=#|\\/<>{}[\]()]/g

// Repeated characters: fuuuuck → fuck
const REPEATED_CHARS = /(.)\1{2,}/g

/**
 * Normalize text for profanity matching.
 * Returns lowercase, stripped, normalized text.
 */
export function normalizeText(input: string): string {
  let text = input

  // 1. Lowercase
  text = text.toLowerCase()

  // 2. Remove Arabic diacritics (tashkeel)
  text = text.replace(ARABIC_DIACRITICS, '')

  // 3. Remove tatweel
  text = text.replace(TATWEEL, '')

  // 4. Normalize Arabic letter variants
  for (const [from, to] of Object.entries(ARABIC_NORMALIZE)) {
    text = text.replaceAll(from, to)
  }

  // 5. Convert leet speak numbers/symbols to letters
  text = text.replace(/[0-9@$!]/g, ch => LEET_MAP[ch] || ch)

  // 6. Remove bypass characters (*, -, _, etc.)
  text = text.replace(BYPASS_CHARS, '')

  // 7. Collapse repeated characters (3+ → 1)
  text = text.replace(REPEATED_CHARS, '$1')

  // 8. Collapse multiple spaces
  text = text.replace(/\s+/g, ' ').trim()

  return text
}

/**
 * Extract individual words from text (splits on spaces + Arabic word boundaries).
 */
export function extractWords(text: string): string[] {
  return text.split(/\s+/).filter(w => w.length > 0)
}

/**
 * Normalize for Arabic-specific matching.
 * More aggressive — also strips ال prefix (definite article).
 */
export function normalizeArabic(word: string): string {
  let w = normalizeText(word)
  // Strip common Arabic prefixes
  if (w.startsWith('ال') && w.length > 3) w = w.slice(2)
  if (w.startsWith('وال') && w.length > 4) w = w.slice(3)
  if (w.startsWith('بال') && w.length > 4) w = w.slice(3)
  return w
}

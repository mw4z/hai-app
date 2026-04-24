/**
 * Lightweight language detection — enough to decide whether a post
 * needs a "Translate" button for a given viewer. Not trying to tell
 * Arabic from Urdu precisely; we only care about the rough bucket.
 *
 *   ar — contains a meaningful share of Arabic-script characters
 *        (Arabic + Perso-Arabic supplementary). Urdu and Arabic both
 *        fall here since both use the Arabic script; we disambiguate
 *        by checking for Urdu-exclusive letters.
 *   ur — Arabic-script text with Urdu-exclusive letters present
 *        (ٹ ڈ ڑ ں ہ etc).
 *   en — default / Latin-script content.
 *
 * Short strings and emoji-only posts return 'en' (no translate prompt).
 */
export type LangBucket = 'ar' | 'en' | 'ur'

const URDU_EXCLUSIVE = /[ٹڈڑںھہۂۃیے]/
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g
const LATIN = /[A-Za-z]/g

export function detectLang(text: string | null | undefined): LangBucket {
  if (!text) return 'en'
  const t = text.trim()
  if (t.length < 3) return 'en'

  const arabicMatches = t.match(ARABIC_SCRIPT)?.length || 0
  const latinMatches = t.match(LATIN)?.length || 0

  // Weight Arabic higher than Latin — a handful of English letters in
  // an otherwise-Arabic post (e.g. "iPhone 15") shouldn't flip it.
  if (arabicMatches >= 3 && arabicMatches * 2 >= latinMatches) {
    return URDU_EXCLUSIVE.test(t) ? 'ur' : 'ar'
  }
  if (latinMatches >= 3) return 'en'
  return 'en'
}

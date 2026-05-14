/**
 * Canonical form of a place name for duplicate detection.
 *
 *   1. NFKC normalization (collapses compatibility codepoints,
 *      e.g. fullwidth digits / ligatures → standard forms).
 *   2. Strip zero-width / bidi / formatting marks. Closes the
 *      bypass where a user adds U+200B between letters to make
 *      a visually-identical name compare as different at .length.
 *   3. Strip Arabic diacritics + tatweel (matches how the
 *      classifier and name validators already handle Arabic).
 *   4. Collapse Arabic letter variants to canonical:
 *        أ إ آ → ا, ى → ي, ة → ه
 *      Same rules the classifier uses on the match side. Storage
 *      stays normal everywhere else; this is purely a dedup key.
 *   5. Lowercase ASCII (no-op for Arabic).
 *   6. Collapse whitespace + trim.
 *
 * This is stored in PlaceListing.nameNormalized at write time and
 * looked up directly by the dupe-detection index
 * (neighborhoodId, nameNormalized, category).
 */
export function normalizePlaceName(input: string): string {
  if (!input) return ''
  let s = input.normalize('NFKC')
  // Zero-width / bidi / formatting marks
  s = s.replace(/[​-‏‪-‮⁠-⁯﻿]/g, '')
  // Arabic diacritics (Tashkeel) + tatweel
  s = s.replace(/[ً-ٰٟـ]/g, '')
  // Arabic letter variant collapse
  s = s
    .replace(/[آأإ]/g, 'ا') // آ أ إ → ا
    .replace(/ى/g, 'ي')               // ى → ي
    .replace(/ة/g, 'ه')               // ة → ه
  // Whitespace + case
  s = s.replace(/\s+/g, ' ').trim().toLowerCase()
  return s
}

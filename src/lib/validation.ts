// Content quality validation utilities

const ARABIC_RE = /[\u0600-\u06FF]/
const LATIN_RE = /[a-zA-Z]/
// Matches strings that contain NO Arabic or Latin letters — effectively emoji/symbol-only
const HAS_REAL_TEXT_RE = /[\u0600-\u06FFa-zA-Z]/
const EXCESSIVE_REPEAT_RE = /(.)\1{4,}/  // same char 5+ times in a row

const FIELD_NAMES = {
  title: { ar: 'العنوان', en: 'Title' },
  body:  { ar: 'المحتوى', en: 'Content' },
}

/** Returns null if valid, or a bilingual error string if invalid */
export function validateContent(text: string, field: 'title' | 'body'): string | null {
  const trimmed = text.trim()
  const f = FIELD_NAMES[field]

  // Min length
  const minLen = field === 'title' ? 3 : 10
  if (trimmed.length < minLen) return `${f.ar} قصير جداً (${minLen} أحرف على الأقل) / ${f.en} too short (min ${minLen})`

  // Max length
  const maxLen = field === 'title' ? 150 : 2000
  if (trimmed.length > maxLen) return `${f.ar} طويل جداً (${maxLen} حرف كحد أقصى) / ${f.en} too long (max ${maxLen})`

  // Must contain at least one real word (Arabic or Latin)
  if (!HAS_REAL_TEXT_RE.test(trimmed)) {
    return 'يجب أن يحتوي على كلمة حقيقية واحدة على الأقل / Must contain at least one real word'
  }

  // Reject excessive repetition (e.g. "!!!!!!!!" or "ااااااااا")
  if (EXCESSIVE_REPEAT_RE.test(trimmed)) {
    return 'تكرار مفرط للأحرف / Excessive character repetition'
  }

  return null
}

/** Normalize text for duplicate comparison */
export function normalizeForComparison(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[!?.,:;]+/g, '')
}

/** Check if two strings are similar (>80% overlap by words) */
export function isSimilar(a: string, b: string): boolean {
  const wordsA = normalizeForComparison(a).split(' ').filter(Boolean)
  const wordsB = new Set(normalizeForComparison(b).split(' ').filter(Boolean))
  if (wordsA.length === 0) return false
  const overlap = wordsA.filter(w => wordsB.has(w)).length
  return overlap / Math.max(wordsA.length, wordsB.size) > 0.8
}

/** Validate image URL format */
export function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  if (url.length > 2048) return false
  // Must start with https or be a data URI (base64)
  if (!url.startsWith('https://') && !url.startsWith('data:image/')) return false
  // If URL, must end with valid image extension or contain image content type
  if (url.startsWith('https://')) {
    const path = url.split('?')[0].toLowerCase()
    const validExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']
    if (!validExts.some(ext => path.endsWith(ext)) && !url.includes('image')) return false
  }
  // If data URI, check format and size (max ~5MB base64 ≈ 6.7M chars)
  if (url.startsWith('data:image/')) {
    const validTypes = ['data:image/jpeg', 'data:image/png', 'data:image/webp', 'data:image/gif']
    if (!validTypes.some(t => url.startsWith(t))) return false
    if (url.length > 7_000_000) return false
  }
  return true
}

/** Standard API error response */
export function apiError(message: string, status: number, code?: string) {
  return { error: { code: code || `ERR_${status}`, message } }
}

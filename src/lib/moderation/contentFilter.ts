/**
 * Content Filter Engine
 * Checks text for profanity, scores severity, censors offensive words.
 */

import { getCompiledDictionary, type ProfanityEntry } from './profanityDictionary'
import { normalizeText, normalizeArabic, extractWords } from './normalizeText'

// ── Types ────────────────────────────────────────────────────────────────

export interface ContentCheckResult {
  isOffensive: boolean
  score: number
  matches: ContentMatch[]
  censored: string
}

export interface ContentMatch {
  word: string          // the original word found in text
  matched: string       // the dictionary entry it matched
  severity: 1 | 2 | 3
  language: 'ar' | 'en'
}

// ── Thresholds ───────────────────────────────────────────────────────────

const THRESHOLDS = {
  WARNING: 2,       // score 1-2: warn but allow
  PENALTY_SMALL: 3, // score 3-5: small rep decrease
  PENALTY_LARGE: 6, // score 6+: large penalty, may block
  BLOCK: 8,         // score 8+: block submission entirely
}

// ── Check Content ────────────────────────────────────────────────────────

/**
 * Analyze text for offensive content.
 * Returns score, matches, and whether it should be blocked.
 */
export function checkContent(text: string): ContentCheckResult {
  const dict = getCompiledDictionary()
  const normalizedFull = normalizeText(text)
  const words = extractWords(normalizedFull)
  const matches: ContentMatch[] = []
  const seen = new Set<string>() // avoid counting same match twice

  // Strategy 1: Word-level exact match
  for (const word of words) {
    // Check the word as-is
    checkWord(word, text, dict, matches, seen)

    // Check with Arabic prefix stripping
    const arabicNorm = normalizeArabic(word)
    if (arabicNorm !== word) {
      checkWord(arabicNorm, text, dict, matches, seen)
    }
  }

  // Strategy 2: Substring scan for multi-word phrases and embedded profanity
  for (const dictWord of dict.allWords) {
    if (dictWord.length < 3) continue // skip very short words to avoid false positives
    if (seen.has(dictWord)) continue
    if (normalizedFull.includes(dictWord)) {
      const entry = dict.wordMap.get(dictWord)
      if (entry) {
        matches.push({
          word: findOriginalWord(text, dictWord),
          matched: dictWord,
          severity: entry.severity,
          language: entry.language,
        })
        seen.add(dictWord)
      }
    }
  }

  // Calculate score
  const score = matches.reduce((sum, m) => sum + m.severity, 0)

  return {
    isOffensive: score >= THRESHOLDS.WARNING,
    score,
    matches,
    censored: score > 0 ? censorText(text, matches) : text,
  }
}

function checkWord(
  word: string,
  originalText: string,
  dict: ReturnType<typeof getCompiledDictionary>,
  matches: ContentMatch[],
  seen: Set<string>,
) {
  if (dict.exactSet.has(word) && !seen.has(word)) {
    const entry = dict.wordMap.get(word)!
    matches.push({
      word: findOriginalWord(originalText, word),
      matched: word,
      severity: entry.severity,
      language: entry.language,
    })
    seen.add(word)
  }
}

/**
 * Find the original (un-normalized) word in the source text.
 */
function findOriginalWord(originalText: string, normalizedWord: string): string {
  const words = originalText.split(/\s+/)
  for (const w of words) {
    if (normalizeText(w) === normalizedWord || normalizeArabic(w) === normalizedWord) {
      return w
    }
  }
  return normalizedWord
}

// ── Censor Text ──────────────────────────────────────────────────────────

/**
 * Replace matched offensive words with asterisks.
 * Preserves sentence structure.
 */
export function censorText(text: string, matches?: ContentMatch[]): string {
  if (!matches) {
    const result = checkContent(text)
    matches = result.matches
  }

  if (matches.length === 0) return text

  let censored = text

  // Sort matches by original word length (longest first) to avoid partial replacements
  const sorted = [...matches].sort((a, b) => b.word.length - a.word.length)

  for (const match of sorted) {
    const original = match.word
    if (original.length === 0) continue

    // Create regex that matches the word with possible separators between chars
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escaped, 'gi')

    censored = censored.replace(regex, (m) => {
      // Keep first and last char, mask the middle
      if (m.length <= 2) return '*'.repeat(m.length)
      return m[0] + '*'.repeat(m.length - 2) + m[m.length - 1]
    })
  }

  return censored
}

// ── Reputation Penalty ───────────────────────────────────────────────────

export interface ModerationAction {
  action: 'allow' | 'warn' | 'censor' | 'block'
  reputationPenalty: number
  reason?: string
  censored: string
  /** Words that triggered the block/censor — shown to the user so they know what to remove. */
  offensiveWords?: string[]
}

/**
 * Determine what action to take based on content check results.
 */
export function getModerationAction(result: ContentCheckResult): ModerationAction {
  const { score, censored, matches } = result
  const offensiveWords = Array.from(new Set(matches.map(m => m.word).filter(Boolean)))

  if (score === 0) {
    return { action: 'allow', reputationPenalty: 0, censored }
  }

  // Any severity-3 match (severe slurs, sexual words, threats) blocks
  // outright — no silent censoring. The user sees exactly which words
  // triggered it so they can edit and retry.
  const hasSevere = matches.some(m => m.severity === 3)
  if (hasSevere) {
    return {
      action: 'block',
      reputationPenalty: -10,
      reason: 'المحتوى يحتوي على كلمات مسيئة',
      censored,
      offensiveWords,
    }
  }

  if (score < THRESHOLDS.WARNING) {
    return { action: 'allow', reputationPenalty: 0, censored }
  }

  if (score < THRESHOLDS.PENALTY_SMALL) {
    return {
      action: 'censor',
      reputationPenalty: 0,
      reason: 'محتوى غير لائق — تم تعديله تلقائياً',
      censored,
      offensiveWords,
    }
  }

  if (score < THRESHOLDS.PENALTY_LARGE) {
    return {
      action: 'censor',
      reputationPenalty: -5,
      reason: 'محتوى مسيء — تم تعديله وخصم سمعة',
      censored,
      offensiveWords,
    }
  }

  // Moderate+ accumulation without a severe term → still block but softer wording
  return {
    action: 'block',
    reputationPenalty: -15,
    reason: 'المحتوى غير مناسب للنشر',
    censored,
    offensiveWords,
  }
}

// ── Convenience: one-call moderation ─────────────────────────────────────

/**
 * Single function to check + moderate content.
 * Use in API routes.
 */
export function moderateContent(text: string): ModerationAction {
  const result = checkContent(text)
  return getModerationAction(result)
}

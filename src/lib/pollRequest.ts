/**
 * Resident-submitted poll request: pure validation, normalization, and
 * rate-limit policy. No DB I/O — the API route owns the rate-limit
 * query and the persistence; everything testable lives here.
 *
 * Rules (mirrored 1:1 in pollRequest.test.ts):
 *   • title:       trim length 5–120
 *   • description: trim length 0–500
 *   • options:     2–8 entries, each trim length 1–80
 *   • reason:      trim length 0–300
 *   • no duplicate options after normalization (zero-width stripped,
 *     whitespace collapsed, lowercased)
 *   • no empty/whitespace/zero-width-only options
 *
 * Rate limit:
 *   • default: 1 submission / 7 days
 *   • reputation ≥ 150: 2 submissions / 7 days
 *   Counts ALL statuses (PENDING + APPROVED + REJECTED) so a user
 *   can't bypass by getting rejected then resubmitting.
 */

export const POLL_REQUEST_LIMITS = {
  title:       { min: 5,  max: 120 },
  description: { min: 0,  max: 500 },
  reason:      { min: 0,  max: 300 },
  option:      { min: 1,  max: 80 },
  options:     { min: 2,  max: 8  },
  rateWindowMs: 7 * 24 * 3600_000,
  rateMaxDefault: 1,
  rateMaxTrusted: 2,
  trustedRepFloor: 150,
} as const

export type ValidationCode =
  | 'title_too_short'
  | 'title_too_long'
  | 'description_too_long'
  | 'options_count'
  | 'option_too_short'
  | 'option_too_long'
  | 'option_blank_or_invisible'
  | 'duplicate_options'
  | 'reason_too_long'

export interface RawPollRequest {
  title: unknown
  description?: unknown
  options: unknown
  reason?: unknown
}

export interface ValidPollRequest {
  title: string
  description: string | null
  options: string[]
  reason: string | null
}

export type ValidationResult =
  | { ok: true; value: ValidPollRequest }
  | { ok: false, error: ValidationCode }

// Zero-width chars commonly used to bypass length checks. Strip these
// before any "is this text" decision. NOT removed from the visible
// option text itself — only used for emptiness + dedup comparison.
//   U+200B  ZERO WIDTH SPACE
//   U+200C  ZERO WIDTH NON-JOINER
//   U+200D  ZERO WIDTH JOINER
//   U+2060  WORD JOINER
//   U+FEFF  ZERO WIDTH NO-BREAK SPACE / BOM
const ZERO_WIDTH = /[​‌‍⁠﻿]/g

function stripZeroWidth(s: string): string {
  return s.replace(ZERO_WIDTH, '')
}

/** Normalize an option for dedup + emptiness comparison only. */
export function normalizeOption(s: string): string {
  return stripZeroWidth(s)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** True if the input is empty after trim + zero-width strip. */
export function isEffectivelyEmpty(s: string): boolean {
  return stripZeroWidth(s).trim().length === 0
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function validatePollRequest(input: RawPollRequest): ValidationResult {
  const L = POLL_REQUEST_LIMITS

  const title = asString(input.title).trim()
  if (title.length < L.title.min) return { ok: false, error: 'title_too_short' }
  if (title.length > L.title.max) return { ok: false, error: 'title_too_long' }
  // Reject titles that are visually-empty (all whitespace or zero-width)
  // even if the raw string had >=5 chars before trim — the trim above
  // already filters those, but a title of "      " (8 spaces) trims to
  // "" which is caught by `title.length < min`. Belt-and-suspenders.
  if (isEffectivelyEmpty(title)) return { ok: false, error: 'title_too_short' }

  const description = asString(input.description).trim()
  if (description.length > L.description.max) return { ok: false, error: 'description_too_long' }

  const reason = asString(input.reason).trim()
  if (reason.length > L.reason.max) return { ok: false, error: 'reason_too_long' }

  const rawOptions = Array.isArray(input.options) ? input.options : []
  // Trim each option's whitespace but PRESERVE zero-width chars inside
  // (some scripts legitimately use them); they only matter for emptiness
  // and dedup, both checked below.
  const trimmedOptions = rawOptions.map(o => asString(o).trim())

  if (trimmedOptions.length < L.options.min) return { ok: false, error: 'options_count' }
  if (trimmedOptions.length > L.options.max) return { ok: false, error: 'options_count' }

  for (const o of trimmedOptions) {
    if (isEffectivelyEmpty(o)) return { ok: false, error: 'option_blank_or_invisible' }
    if (o.length < L.option.min)  return { ok: false, error: 'option_too_short' }
    if (o.length > L.option.max)  return { ok: false, error: 'option_too_long' }
  }

  // Dedup via normalized form. "نعم" vs "نعم " vs "نعم<ZWSP>" all
  // collapse to the same key.
  const seen = new Set<string>()
  for (const o of trimmedOptions) {
    const key = normalizeOption(o)
    if (seen.has(key)) return { ok: false, error: 'duplicate_options' }
    seen.add(key)
  }

  return {
    ok: true,
    value: {
      title,
      description: description.length > 0 ? description : null,
      options: trimmedOptions,
      reason: reason.length > 0 ? reason : null,
    },
  }
}

export interface RateLimitPolicy {
  windowMs: number
  max: number
}

/** Pure policy: how many submissions a user with this reputation is
 *  allowed inside the 7-day window. */
export function pollRequestLimitFor(reputation: number): RateLimitPolicy {
  const L = POLL_REQUEST_LIMITS
  return {
    windowMs: L.rateWindowMs,
    max: reputation >= L.trustedRepFloor ? L.rateMaxTrusted : L.rateMaxDefault,
  }
}

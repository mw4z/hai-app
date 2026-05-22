/**
 * Structured "suggest a correction" logic for directory places — pure,
 * unit-testable. A resident proposes new values for an allowlisted set of
 * fields; we build CHANGED-only diffs grouped by the contribution type
 * each field belongs to. Anything outside the allowlist is ignored
 * server-side, so residents can never touch status / ownership / provider
 * / Google / admin fields.
 */
import type { ContributionType } from '@/lib/reputation/directoryRewards'

type SuggestType = 'EDIT_PLACE' | 'ADD_CONTACT' | 'FIX_LOCATION'

/** Resident-suggestable fields, grouped by the contribution type. */
export const SUGGESTABLE_FIELDS: Record<SuggestType, string[]> = {
  EDIT_PLACE:   ['name', 'category', 'description', 'addressText'],
  ADD_CONTACT:  ['phone', 'whatsapp', 'website', 'instagram'],
  FIX_LOCATION: ['latitude', 'longitude'],
}

const FIELD_TO_TYPE: Record<string, SuggestType> = (() => {
  const m: Record<string, SuggestType> = {}
  for (const t of Object.keys(SUGGESTABLE_FIELDS) as SuggestType[]) {
    for (const k of SUGGESTABLE_FIELDS[t]) m[k] = t
  }
  return m
})()

export function contributionTypeForField(key: string): ContributionType | null {
  return (FIELD_TO_TYPE[key] as ContributionType | undefined) ?? null
}

export interface FieldDiff {
  key: string
  oldValue: unknown
  suggestedValue: unknown
  contributionType: ContributionType
}

function normalizeVal(key: string, raw: unknown): unknown {
  if (key === 'latitude' || key === 'longitude') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : undefined
  }
  if (typeof raw === 'string') {
    const t = raw.trim()
    return t.slice(0, key === 'description' ? 1000 : 300)
  }
  return raw
}

function sameVal(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6
  if ((a == null || a === '') && (b == null || b === '')) return true
  return String(a ?? '') === String(b ?? '')
}

/**
 * Build CHANGED field diffs from the current place + proposed values.
 * Only allowlisted fields that actually differ survive — so a no-op
 * suggestion yields [] (→ nothing to review, nothing to reward).
 */
export function buildSuggestionDiffs(
  current: Record<string, unknown>,
  proposed: Record<string, unknown>,
): FieldDiff[] {
  const out: FieldDiff[] = []
  for (const [key, raw] of Object.entries(proposed)) {
    const type = contributionTypeForField(key)
    if (!type) continue
    const suggested = normalizeVal(key, raw)
    if (suggested === undefined || suggested === null || suggested === '') continue
    const old = current[key] ?? null
    if (sameVal(old, suggested)) continue
    out.push({ key, oldValue: old ?? null, suggestedValue: suggested, contributionType: type })
  }
  return out
}

/** Distinct contribution types present in a diff set (one award each). */
export function typesInDiffs(diffs: FieldDiff[]): ContributionType[] {
  return Array.from(new Set(diffs.map((d) => d.contributionType)))
}

/** Reject reviewer-notes that smuggle links / contact spam. (Applies to
 *  the free-text note only — never to the structured contact fields.) */
const NOTE_SPAM_RE = /(https?:\/\/|www\.|t\.me\/|wa\.me\/|@[\w.]+|\b\d{7,}\b)/i
export function noteHasSpam(note: string): boolean {
  return NOTE_SPAM_RE.test(note)
}

/**
 * Phase 1 structured metadata inference. Pure, server-side, no I/O.
 *
 * Given a post's title+body+resolved category, returns the optional
 * subtype fields the schema accepts:
 *
 *   realEstateType   only when category === 'REAL_ESTATE'
 *   civicType        only when category === 'NEIGHBORHOOD_REPORTS'
 *   eventHints       only when category === 'EVENTS'
 *   signals          matched-rule names for debug visibility
 *   confidenceScore  0..1 — caller writes the field only when ≥ 0.85
 *
 * Conservative by design: when in doubt, return null. The composer
 * never asks the user for these fields; if we infer wrong we'd be
 * silently mislabeling content, so the bar is high.
 */

import type { RealEstateType, CivicType, PostCategory } from '@prisma/client'
import {
  normalizeArabicForMatch,
  scoreRules,
  RE_APARTMENT_RULES,
  RE_VILLA_RULES,
  RE_LAND_RULES,
  RE_WAREHOUSE_RULES,
  RE_RENT_RULES,
  RE_SALE_RULES,
  RE_WANTED_RULES,
  REAL_ESTATE_COMMERCIAL_SHOP_RULES,
  CIVIC_TRAFFIC_SAFETY_RULES,
  CIVIC_INFRASTRUCTURE_RULES,
  CIVIC_PUBLIC_SERVICES_RULES,
  CIVIC_ENVIRONMENT_RULES,
  CIVIC_PROPOSAL_RULES,
  CIVIC_COMPLAINT_RULES,
} from './classifyDictionaries'

export interface MetadataInput {
  title: string
  body: string
  category: PostCategory
}

export interface MetadataResult {
  realEstateType: RealEstateType | null
  civicType: CivicType | null
  eventHints: {
    startAt: Date | null
    endAt: Date | null
    location: string | null
  }
  confidenceScore: number     // 0..1, max over inferred subtypes
  signals: string[]           // matched rule labels (debug)
}

// Threshold tiers — aligned with the spec's "<0.65 = do not infer"
// floor. We write subtypes at confidence ≥ 0.65 because Phase 1 has no
// user-confirmation UI; the 0.85/0.65 split would only matter if there
// was a "suggest" flow that asked the user to confirm.
//
//   score ≥ 7 → 0.90 (strong: paired property+tenure+more, or 3 distinct
//                     civic rules — well-formed real-world posts)
//   score ≥ 5 → 0.70 (typical: paired property+tenure, or 2 civic rules)
//   score ≥ 2 → 0.50 (weak signal, no write)
//   else     → 0.20
const MIN_SCORE_FOR_SUBTYPE = 5      // floor for inference write
const STRONG_SCORE_FOR_SUBTYPE = 7
const TIE_MARGIN = 2                 // top must beat next by ≥ this

function scoreToConfidence(score: number): number {
  if (score >= STRONG_SCORE_FOR_SUBTYPE) return 0.90
  if (score >= MIN_SCORE_FOR_SUBTYPE) return 0.70
  if (score >= 2) return 0.50
  return 0.20
}

/* ─── Real-estate subtype ─────────────────────────────────────────── */

function inferRealEstateType(text: string): { type: RealEstateType | null; score: number; signals: string[] } {
  const apt = scoreRules(text, RE_APARTMENT_RULES)
  const villa = scoreRules(text, RE_VILLA_RULES)
  const land = scoreRules(text, RE_LAND_RULES)
  const warehouse = scoreRules(text, RE_WAREHOUSE_RULES)
  const rent = scoreRules(text, RE_RENT_RULES)
  const sale = scoreRules(text, RE_SALE_RULES)
  const wanted = scoreRules(text, RE_WANTED_RULES)
  const commercial = scoreRules(text, REAL_ESTATE_COMMERCIAL_SHOP_RULES)

  const signals = [
    ...apt.signals, ...villa.signals, ...land.signals, ...warehouse.signals,
    ...rent.signals, ...sale.signals, ...wanted.signals, ...commercial.signals,
  ]

  // Candidate paths — each accumulates one property-type score plus
  // a tenure score (rent/sale). WANTED is a special path that activates
  // only when nothing else combines cleanly.
  const paths: Array<{ type: RealEstateType; score: number }> = []

  if (apt.score > 0) {
    if (rent.score > 0)  paths.push({ type: 'APARTMENT_RENT', score: apt.score + rent.score })
    if (sale.score > 0)  paths.push({ type: 'APARTMENT_SALE', score: apt.score + sale.score })
  }
  if (villa.score > 0) {
    if (rent.score > 0)  paths.push({ type: 'VILLA_RENT', score: villa.score + rent.score })
    if (sale.score > 0)  paths.push({ type: 'VILLA_SALE', score: villa.score + sale.score })
  }
  if (land.score > 0 && (sale.score > 0 || /صك|مساحه|مساحة|متر/.test(text))) {
    paths.push({ type: 'LAND_SALE', score: land.score + sale.score + 1 })
  }
  if (warehouse.score > 0) {
    paths.push({ type: 'WAREHOUSE', score: warehouse.score + Math.max(rent.score, sale.score) })
  }
  // COMMERCIAL_SHOP requires the محل-paired-with-modifier rule to fire.
  // The bare word "محل" alone (e.g. "وين محل نظارات") never enters here.
  if (commercial.score > 0) {
    paths.push({ type: 'COMMERCIAL_SHOP', score: commercial.score + Math.max(rent.score, sale.score) })
  }
  // WANTED: explicit "looking for" wording + any property type.
  if (wanted.score > 0 && (apt.score > 0 || villa.score > 0 || land.score > 0 || warehouse.score > 0 || commercial.score > 0)) {
    paths.push({
      type: 'WANTED',
      // Add wanted.score on top of property type so WANTED outranks
      // the implicit RENT/SALE guess when the user is asking.
      score: wanted.score + Math.max(apt.score, villa.score, land.score, warehouse.score, commercial.score),
    })
  }

  if (paths.length === 0) return { type: null, score: 0, signals }

  paths.sort((a, b) => b.score - a.score)
  const top = paths[0]
  const next = paths[1]
  if (top.score < MIN_SCORE_FOR_SUBTYPE) return { type: null, score: top.score, signals }
  // If top is REQUEST-flavored (WANTED) AND there's a non-WANTED tie,
  // prefer WANTED — the user asking trumps the implicit tenure guess.
  if (next && next.score === top.score && top.type !== 'WANTED' && next.type === 'WANTED') {
    return { type: 'WANTED', score: next.score, signals }
  }
  // Standard tie-break: top must beat next by TIE_MARGIN; otherwise null.
  if (next && top.score - next.score < TIE_MARGIN) return { type: null, score: top.score, signals }
  return { type: top.type, score: top.score, signals }
}

/* ─── Civic subtype ───────────────────────────────────────────────── */

function inferCivicType(text: string): { type: CivicType | null; score: number; signals: string[] } {
  const ts = scoreRules(text, CIVIC_TRAFFIC_SAFETY_RULES)
  const infra = scoreRules(text, CIVIC_INFRASTRUCTURE_RULES)
  const pub = scoreRules(text, CIVIC_PUBLIC_SERVICES_RULES)
  const env = scoreRules(text, CIVIC_ENVIRONMENT_RULES)
  const prop = scoreRules(text, CIVIC_PROPOSAL_RULES)
  const cmp = scoreRules(text, CIVIC_COMPLAINT_RULES)

  const candidates: Array<{ type: CivicType; score: number; signals: string[] }> = [
    { type: 'TRAFFIC_SAFETY'  as const, score: ts.score,    signals: ts.signals },
    { type: 'INFRASTRUCTURE'  as const, score: infra.score, signals: infra.signals },
    { type: 'PUBLIC_SERVICES' as const, score: pub.score,   signals: pub.signals },
    { type: 'ENVIRONMENT'     as const, score: env.score,   signals: env.signals },
    { type: 'PROPOSAL'        as const, score: prop.score,  signals: prop.signals },
    { type: 'COMPLAINT'       as const, score: cmp.score,   signals: cmp.signals },
  ].sort((a, b) => b.score - a.score)

  const top = candidates[0]
  const next = candidates[1]
  const allSignals = candidates.flatMap(c => c.signals)
  if (top.score < MIN_SCORE_FOR_SUBTYPE) return { type: null, score: top.score, signals: allSignals }
  // Within-margin tie-break: PROPOSAL is the user's *active framing*
  // ("نحتاج / نطالب / نقترح") and beats topical buckets like
  // INFRASTRUCTURE or TRAFFIC_SAFETY when both fire close together —
  // "نحتاج مطبات" is a proposal, not a traffic report. COMPLAINT
  // beats topical buckets too, but loses to PROPOSAL when both fire.
  // Outside this window, the topical bucket's higher score wins
  // outright.
  const propCandidate = candidates.find(c => c.type === 'PROPOSAL')
  const cmpCandidate  = candidates.find(c => c.type === 'COMPLAINT')
  // PROPOSAL uses `<=` TIE_MARGIN (inclusive) — the user's explicit
  // "نطالب / نقترح" framing should win even on a clean 2-point gap
  // against a topical bucket like INFRASTRUCTURE. "نطالب بحملة تطوير
  // شاملة للحي، الأرصفة والإنارة والتشجير" must come out as PROPOSAL,
  // not INFRASTRUCTURE, because the user is proposing — the rest is
  // context.
  if (propCandidate && top.type !== 'PROPOSAL' &&
      propCandidate.score >= MIN_SCORE_FOR_SUBTYPE &&
      top.score - propCandidate.score <= TIE_MARGIN) {
    return { type: 'PROPOSAL', score: propCandidate.score, signals: allSignals }
  }
  if (cmpCandidate && top.type !== 'PROPOSAL' && top.type !== 'COMPLAINT' &&
      cmpCandidate.score >= MIN_SCORE_FOR_SUBTYPE &&
      top.score - cmpCandidate.score <= TIE_MARGIN) {
    return { type: 'COMPLAINT', score: cmpCandidate.score, signals: allSignals }
  }
  // Standard tie-break — only nullify when the top is a TOPICAL bucket
  // (infrastructure / traffic-safety / etc.). PROPOSAL and COMPLAINT
  // are user-framing types: when the user says "نطالب" or "اشتكي",
  // their framing wins even over a close-second topical mention.
  if (next && top.score - next.score < TIE_MARGIN &&
      top.type !== 'PROPOSAL' && top.type !== 'COMPLAINT') {
    return { type: null, score: top.score, signals: allSignals }
  }
  return { type: top.type, score: top.score, signals: allSignals }
}

/* ─── Event hints (conservative — leave null if uncertain) ─────────── */

const AR_WEEKDAYS: Record<string, number> = {
  // 0 = Sunday … 6 = Saturday (JS convention)
  // Variants get folded by normalizeArabicForMatch, so we only need
  // one canonical entry per weekday (alif variants collapsed, taa
  // marbouta → haa, diacritics stripped).
  'الاحد': 0,
  'الاثنين': 1,
  'الثلاثاء': 2,
  'الاربعاء': 3,
  'الخميس': 4,
  'الجمعه': 5,
  'السبت': 6,
}

function nextWeekdayAt(weekday: number, base: Date): Date {
  const result = new Date(base)
  const day = result.getDay()
  const diff = (weekday - day + 7) % 7 || 7
  result.setDate(result.getDate() + diff)
  result.setHours(12, 0, 0, 0)
  return result
}

function inferEventHints(rawText: string, normalized: string): MetadataResult['eventHints'] {
  // Conservative parsing — never block publish, leave null if unclear.
  let startAt: Date | null = null
  const now = new Date()

  // "بكرة" / "بكره" → tomorrow noon
  if (/(?:^|\s)(?:بكره|بكرة|بكرا|غدا|غداً)(?:\s|$)/.test(normalized)) {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    d.setHours(12, 0, 0, 0)
    startAt = d
  }
  // "اليوم" → today noon (only if no other date hint fired)
  else if (/(?:^|\s)(?:اليوم|اليومين)(?:\s|$)/.test(normalized)) {
    const d = new Date(now)
    d.setHours(12, 0, 0, 0)
    startAt = d
  }
  // "الجمعه الجايه" / "الجمعه القادمه" / weekday alone → next occurrence
  else {
    for (const [token, weekday] of Object.entries(AR_WEEKDAYS)) {
      const tokenN = normalizeArabicForMatch(token)
      if (new RegExp(`(?:^|\\s)${tokenN}(?:\\s|$)`).test(normalized)) {
        startAt = nextWeekdayAt(weekday, now)
        break
      }
    }
  }

  // Time "الساعه 7" / "الساعة ٧" — overlay on startAt if both present.
  // Only when startAt was inferred from a date hint (don't fabricate a
  // date from a bare time).
  if (startAt) {
    // Arabic-Indic + western digits.
    const arabicDigits = /[٠-٩]/g
    const norm = normalized.replace(arabicDigits, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    const m = norm.match(/الساعه?\s*(\d{1,2})(?::(\d{2}))?\s*(م|ص|pm|am)?/i)
    if (m) {
      let hour = Number(m[1])
      const minute = m[2] ? Number(m[2]) : 0
      const ampm = (m[3] || '').toLowerCase()
      if ((ampm === 'م' || ampm === 'pm') && hour < 12) hour += 12
      if ((ampm === 'ص' || ampm === 'am') && hour === 12) hour = 0
      if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
        startAt.setHours(hour, minute, 0, 0)
      }
    }
  }

  // Location: take a short noun phrase after "في" / "ب" / "عند" / "خلف"
  // / "بجوار" — single token sequence, max 80 chars. Only when an event
  // start was inferred (no point storing a location alone).
  let location: string | null = null
  if (startAt) {
    const m = rawText.match(/(?:في|ب|عند|خلف|بجوار)\s+([^،.,\n]{2,80})/)
    if (m && m[1]) location = m[1].trim().slice(0, 80)
  }

  return { startAt, endAt: null, location }
}

/* ─── Public entry point ──────────────────────────────────────────── */

export function inferPostMetadata(input: MetadataInput): MetadataResult {
  const rawText = `${input.title || ''}\n${input.body || ''}`
  const normalized = normalizeArabicForMatch(rawText)

  let realEstateType: RealEstateType | null = null
  let civicType: CivicType | null = null
  let eventHints: MetadataResult['eventHints'] = { startAt: null, endAt: null, location: null }
  let topScore = 0
  const allSignals: string[] = []

  if (input.category === 'REAL_ESTATE') {
    const out = inferRealEstateType(normalized)
    realEstateType = out.type
    topScore = Math.max(topScore, out.score)
    allSignals.push(...out.signals)
  }
  if (input.category === 'NEIGHBORHOOD_REPORTS') {
    const out = inferCivicType(normalized)
    civicType = out.type
    topScore = Math.max(topScore, out.score)
    allSignals.push(...out.signals)
  }
  if (input.category === 'EVENTS') {
    eventHints = inferEventHints(rawText, normalized)
    // Event start parsing is opportunistic, not authoritative — its
    // presence gives a modest confidence bump but isn't required.
    if (eventHints.startAt) topScore = Math.max(topScore, MIN_SCORE_FOR_SUBTYPE)
  }

  return {
    realEstateType,
    civicType,
    eventHints,
    confidenceScore: scoreToConfidence(topScore),
    signals: allSignals,
  }
}

/** Caller-side gate: should the field actually be written to the row?
 *  Spec says "<0.65 = do not infer subtype". Phase 1 has no confirm
 *  step, so we write at the inference floor — paired property+tenure
 *  for real-estate, or two distinct civic rules. */
export const SUBTYPE_WRITE_THRESHOLD = 0.65

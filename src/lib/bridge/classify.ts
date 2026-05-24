/**
 * WhatsApp-bridge message classifier — PURE, no I/O, fully testable.
 *
 * Two jobs:
 *   1. classifyBridgeMessage(text) — is a group message useful for Hai,
 *      and if so what (category/intent)? Risky/uncertain → ignore.
 *   2. evaluateBridgeIngest(...) — the server-side gate the ingest endpoint
 *      runs on EVERY message (never trusts the caller's classification):
 *      flag on? confirmed? right test neighborhood? useful + safe + confident?
 *
 * Conservative by design: when in doubt, IGNORE. Only ever produces
 * REQUEST posts in a tiny allowlist of categories — never emergency,
 * marketplace, high-priority, polls, etc.
 */

export type BridgeType =
  | 'service_request'
  | 'neighborhood_question'
  | 'lost_found'
  | 'contact_request'
  | 'simple_help'

// The only Hai categories the bridge may target.
export type BridgeCategory = 'SERVICES' | 'GENERAL' | 'LOST_FOUND'

export interface BridgeClassification {
  decision: 'useful' | 'ignore'
  type?: BridgeType
  category?: BridgeCategory
  intent?: 'REQUEST'
  confidence: number // 0..1
  /** Reason it was ignored — 'risk:<kind>' for blocked content, or 'not_useful'. */
  reason?: string
}

const MAX_LEN = 600

// ── Risk signals (any hit → ignore, never prompt) ──────────────────────
const URL_RE = /(https?:\/\/|www\.|t\.me\/|wa\.me\/|bit\.ly|\b\S+\.(com|net|org|io|ly|me)\b)/i
const IBAN_RE = /\bSA\d{2}\s?\d{2}/i // Saudi IBAN-ish
const NATIONAL_ID_RE = /\b[12]\d{9}\b/ // 10-digit Saudi ID / iqama
const PHONE_RE = /(\+?9665\d{8}|\b05\d{8}\b)/g

const EMERGENCY = ['حريق', 'حادث', 'حوادث', 'سرقة', 'طوارئ', 'إسعاف', 'اسعاف', 'نجدة', 'شرطة', 'إطلاق نار', 'اطلاق نار', 'خطر', 'انفجار', 'غرق', 'مفقود طفل', 'اختطاف']
const POLITICAL = ['قبيلة', 'قبيله', 'طائفة', 'طائفه', 'سياسة', 'سياسه', 'الحكومة', 'الحكومه', 'تطبيع', 'فتنة', 'عنصري']
const ACCUSATION = ['نصاب', 'محتال', 'حرامي', 'كذاب', 'لص', 'فاسد', 'مزور']

// ── Useful-type keyword sets ───────────────────────────────────────────
const LOST_FOUND = ['ضاع', 'ضاعت', 'ضايع', 'فقدت', 'مفقود', 'مفقوده', 'لقطة', 'لقطه', 'لقيت', 'عثرت', 'وجدت محفظة', 'ضايعه']
const TRADES = ['سباك', 'كهربائي', 'نجار', 'دهان', 'فني', 'ميكانيكي', 'مكيفات', 'سباكة', 'بلاط', 'حداد', 'معلم', 'ستلايت', 'مكافحة حشرات', 'نقل عفش', 'عامل', 'خادمة', 'سائق']
const SERVICE_ASK = ['تعرفون', 'تعرفوا', 'مين يعرف', 'احد يعرف', 'أحد يعرف', 'فيه أحد', 'تنصحوني', 'وش رايكم في', 'ابغى رقم', 'أبغى رقم', 'رقم', 'تواصل']
const QUESTION = ['وين', 'فين', 'متى', 'كيف', 'هل يوجد', 'هل فيه', 'في أحد', 'أقرب', 'اقرب', 'أبحث عن', 'ابحث عن', 'وش', 'ايش', 'أي', 'كم سعر']
const HELP = ['أحتاج', 'احتاج', 'محتاج', 'ممكن مساعدة', 'يساعدني', 'يوصل', 'توصيل غرض', 'أبي أحد', 'ابي احد', 'مساعدة']
const IGNORE_HINTS = ['السلام عليكم', 'صباح الخير', 'مساء الخير', 'شكرا', 'شكراً', 'جزاك', 'يعطيك العافية', 'تسلم', 'الله يحفظ', 'ماشاء', 'تصبحون', 'حياك', 'هلا', 'كيف الحال', 'الله يعطيك']

function has(text: string, list: string[]): boolean {
  return list.some((k) => text.includes(k))
}

export function classifyBridgeMessage(textRaw: string): BridgeClassification {
  const text = (textRaw || '').trim()
  if (!text) return { decision: 'ignore', confidence: 0, reason: 'empty' }

  // ── Hard risk blocks ──────────────────────────────────────────────
  if (text.length > MAX_LEN) return { decision: 'ignore', confidence: 0, reason: 'risk:too_long' }
  if (URL_RE.test(text)) return { decision: 'ignore', confidence: 0, reason: 'risk:link' }
  if (IBAN_RE.test(text) || NATIONAL_ID_RE.test(text)) return { decision: 'ignore', confidence: 0, reason: 'risk:pii' }
  if ((text.match(PHONE_RE) || []).length >= 2) return { decision: 'ignore', confidence: 0, reason: 'risk:pii' }
  if (has(text, EMERGENCY)) return { decision: 'ignore', confidence: 0, reason: 'risk:emergency' }
  if (has(text, POLITICAL)) return { decision: 'ignore', confidence: 0, reason: 'risk:political' }
  if (has(text, ACCUSATION)) return { decision: 'ignore', confidence: 0, reason: 'risk:accusation' }

  // ── Useful types (order: most specific first) ─────────────────────
  if (has(text, LOST_FOUND)) {
    return { decision: 'useful', type: 'lost_found', category: 'LOST_FOUND', intent: 'REQUEST', confidence: 0.85 }
  }
  const tradeOrService = has(text, TRADES) || has(text, SERVICE_ASK)
  if (tradeOrService && (has(text, SERVICE_ASK) || has(text, QUESTION) || has(text, HELP))) {
    const isContact = text.includes('رقم') || text.includes('تواصل')
    return {
      decision: 'useful',
      type: isContact ? 'contact_request' : 'service_request',
      category: 'SERVICES', intent: 'REQUEST',
      confidence: 0.8,
    }
  }
  if (has(text, QUESTION)) {
    return { decision: 'useful', type: 'neighborhood_question', category: 'GENERAL', intent: 'REQUEST', confidence: 0.65 }
  }
  if (has(text, HELP)) {
    return { decision: 'useful', type: 'simple_help', category: 'GENERAL', intent: 'REQUEST', confidence: 0.6 }
  }

  // Greetings / thanks / casual → explicitly not useful.
  if (has(text, IGNORE_HINTS)) return { decision: 'ignore', confidence: 0, reason: 'not_useful' }

  return { decision: 'ignore', confidence: 0.2, reason: 'not_useful' }
}

// ── Server-side ingest gate ────────────────────────────────────────────
export interface BridgeConfig {
  enabled: boolean
  mode: string // 'test' | 'live'
  testNeighborhoodId: string | null
}

export interface IngestInput {
  text: string
  confirmedBySender: boolean
  neighborhoodId: string
  config: BridgeConfig
}

export type IngestDecision =
  | { ok: true; classification: BridgeClassification }
  | { ok: false; code: string; message: string; classification?: BridgeClassification }

const MIN_CONFIDENCE = 0.5

/**
 * The gate the endpoint runs on every payload. Re-classifies server-side
 * (never trusts the caller). Pure — DB-backed checks (idempotency, rate
 * limit) happen in the route on top of this.
 */
export function evaluateBridgeIngest(input: IngestInput): IngestDecision {
  if (!input.config.enabled) {
    return { ok: false, code: 'bridge_disabled', message: 'الجسر معطّل' }
  }
  if (!input.confirmedBySender) {
    return { ok: false, code: 'not_confirmed', message: 'لم يؤكد المُرسل' }
  }
  if (input.config.mode === 'test') {
    if (!input.config.testNeighborhoodId) {
      return { ok: false, code: 'no_test_neighborhood', message: 'لا يوجد حي اختبار مهيأ' }
    }
    if (input.neighborhoodId !== input.config.testNeighborhoodId) {
      return { ok: false, code: 'wrong_neighborhood', message: 'الحي خارج نطاق الاختبار' }
    }
  }
  const classification = classifyBridgeMessage(input.text)
  if (classification.decision !== 'useful') {
    const risky = classification.reason?.startsWith('risk:')
    return {
      ok: false,
      code: risky ? 'risky_content' : 'not_useful',
      message: risky ? 'المحتوى غير مناسب للنشر' : 'الرسالة غير مناسبة كطلب',
      classification,
    }
  }
  if (classification.confidence < MIN_CONFIDENCE) {
    return { ok: false, code: 'low_confidence', message: 'غير متأكد من التصنيف', classification }
  }
  return { ok: true, classification }
}

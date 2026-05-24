/**
 * WhatsApp-bridge classifier + ingest-gate tests (pure, no DB).
 * Run: node --import tsx --test src/lib/bridge/classify.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyBridgeMessage, evaluateBridgeIngest, type BridgeConfig } from './classify'

const cfg = (over: Partial<BridgeConfig> = {}): BridgeConfig => ({
  enabled: true, mode: 'test', testNeighborhoodId: 'nbhd_test', ...over,
})

// ── Useful messages (the spec's examples) ──────────────────────────────
test('service request → SERVICES/REQUEST', () => {
  const c = classifyBridgeMessage('تعرفون سباك قريب؟')
  assert.equal(c.decision, 'useful'); assert.equal(c.category, 'SERVICES'); assert.equal(c.intent, 'REQUEST')
})
test('asking for a contact → SERVICES/REQUEST', () => {
  const c = classifyBridgeMessage('مين يعرف كهربائي؟')
  assert.equal(c.decision, 'useful'); assert.equal(c.category, 'SERVICES')
})
test('neighborhood question → GENERAL/REQUEST', () => {
  const c = classifyBridgeMessage('وين أقرب مغسلة؟')
  assert.equal(c.decision, 'useful'); assert.equal(c.category, 'GENERAL'); assert.equal(c.intent, 'REQUEST')
})
test('lost/found → LOST_FOUND', () => {
  const c = classifyBridgeMessage('ضاعت محفظة عند المسجد')
  assert.equal(c.decision, 'useful'); assert.equal(c.category, 'LOST_FOUND')
})
test('simple help → GENERAL/REQUEST', () => {
  const c = classifyBridgeMessage('أحتاج أحد يوصل غرض')
  assert.equal(c.decision, 'useful'); assert.equal(c.category, 'GENERAL')
})

// ── Ignored (casual / greetings / thanks) ──────────────────────────────
test('greeting ignored', () => {
  assert.equal(classifyBridgeMessage('السلام عليكم ورحمة الله').decision, 'ignore')
})
test('thanks/prayer ignored', () => {
  assert.equal(classifyBridgeMessage('جزاك الله خير يعطيك العافية').decision, 'ignore')
})
test('empty ignored', () => {
  assert.equal(classifyBridgeMessage('   ').decision, 'ignore')
})

// ── Risky (must never publish) ─────────────────────────────────────────
test('emergency content blocked', () => {
  const c = classifyBridgeMessage('فيه حريق في العمارة اتصلوا بالطوارئ')
  assert.equal(c.decision, 'ignore'); assert.equal(c.reason, 'risk:emergency')
})
test('accusation against a person blocked', () => {
  const c = classifyBridgeMessage('فلان نصاب لا تتعاملون معه')
  assert.equal(c.decision, 'ignore'); assert.equal(c.reason, 'risk:accusation')
})
test('political/tribal content blocked', () => {
  assert.equal(classifyBridgeMessage('هذي مشكلة قبيلة وسياسة').reason, 'risk:political')
})
test('link blocked', () => {
  assert.equal(classifyBridgeMessage('شوفوا العرض هنا https://x.com/deal').reason, 'risk:link')
})
test('PII (IBAN / national id) blocked', () => {
  assert.equal(classifyBridgeMessage('حول على ايبان SA44 2000 0001').reason, 'risk:pii')
  assert.equal(classifyBridgeMessage('رقم هويتي 1098765432').reason, 'risk:pii')
})
test('too long blocked', () => {
  assert.equal(classifyBridgeMessage('سباك '.repeat(200)).reason, 'risk:too_long')
})

// ── Ingest gate ────────────────────────────────────────────────────────
const useful = { text: 'تعرفون سباك قريب؟', confirmedBySender: true, neighborhoodId: 'nbhd_test' }

test('gate: confirmed useful in test neighborhood → ok', () => {
  assert.equal(evaluateBridgeIngest({ ...useful, config: cfg() }).ok, true)
})
test('gate: feature flag off → blocked', () => {
  const r = evaluateBridgeIngest({ ...useful, config: cfg({ enabled: false }) })
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.code, 'bridge_disabled')
})
test('gate: unconfirmed → rejected', () => {
  const r = evaluateBridgeIngest({ ...useful, confirmedBySender: false, config: cfg() })
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.code, 'not_confirmed')
})
test('gate: wrong neighborhood in test mode → rejected', () => {
  const r = evaluateBridgeIngest({ ...useful, neighborhoodId: 'nbhd_other', config: cfg() })
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.code, 'wrong_neighborhood')
})
test('gate: risky confirmed message → rejected', () => {
  const r = evaluateBridgeIngest({ text: 'حريق طوارئ', confirmedBySender: true, neighborhoodId: 'nbhd_test', config: cfg() })
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.code, 'risky_content')
})
test('gate: not-useful confirmed message → rejected', () => {
  const r = evaluateBridgeIngest({ text: 'السلام عليكم', confirmedBySender: true, neighborhoodId: 'nbhd_test', config: cfg() })
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.code, 'not_useful')
})

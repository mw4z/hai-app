/**
 * Tests for the service-contact directory core logic — phone
 * normalization, the resolve-or-create order, extraction from text, and
 * safety helpers. Pure functions only (no DB).
 *
 * Run:
 *   node --import tsx --test src/lib/services/serviceContact.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toE164, isValidServicePhone } from './phoneFormat'
import { resolveServiceContact, resolutionResponse } from './resolveServiceContact'
import { extractPhoneCandidates, inferServiceCategory, inferDisplayName, extractServiceContact } from './extractContact'
import { isValidServiceReportReason, serviceContactHideThreshold } from './serviceContactSafety'
import { phoneHash } from './phone'

// ── E.164 normalization ─────────────────────────────────────────────
test('all common Saudi mobile forms normalize to the SAME E.164', () => {
  const forms = ['0512345678', '512345678', '+966512345678', '00966512345678', '966512345678', '966-51-234-5678']
  const normalized = forms.map(toE164)
  for (const n of normalized) assert.equal(n, '+966512345678')
})

test('toE164 rejects junk', () => {
  assert.equal(toE164('hello'), null)
  assert.equal(toE164('123'), null)
  assert.equal(toE164(''), null)
  assert.equal(isValidServicePhone('0512345678'), true)
  assert.equal(isValidServicePhone('nope'), false)
})

test('manipulated client cannot bypass dedup: equal numbers → equal hash', () => {
  // Different shapes of the same number must hash identically so a
  // re-formatted phone can't dodge duplicate detection.
  const a = phoneHash(toE164('0512345678')!)
  const b = phoneHash(toE164('+966 51 234 5678')!)
  assert.equal(a, b)
  // A different number hashes differently.
  assert.notEqual(a, phoneHash(toE164('0512345679')!))
})

// ── Resolution order ────────────────────────────────────────────────
test('verified provider match returns MATCHED_PROVIDER (no create)', () => {
  const r = resolveServiceContact({ providerUserId: 'u1', existingContactId: 'c1', linkedUserId: 'u1' })
  assert.equal(r.kind, 'MATCHED_PROVIDER')
  assert.equal(r.kind === 'MATCHED_PROVIDER' && r.providerUserId, 'u1')
})

test('existing service contact is linked, not duplicated', () => {
  const r = resolveServiceContact({ providerUserId: null, existingContactId: 'c1', linkedUserId: 'u9' })
  assert.equal(r.kind, 'MATCHED_SERVICE_CONTACT')
})

test('normal-user match → GENERIC_PENDING_MATCH and does not expose identity', () => {
  const r = resolveServiceContact({ providerUserId: null, existingContactId: null, linkedUserId: 'u42' })
  assert.equal(r.kind, 'GENERIC_PENDING_MATCH')
  // The public response must be generic — no hint that a user owns it.
  const resp = resolutionResponse(r)
  assert.equal(resp.code, 'GENERIC_PENDING_MATCH')
  assert.ok(!resp.messageAr.includes('مستخدم'))
  assert.ok(!resp.messageAr.includes('u42'))
})

test('no match → CREATE_NEW', () => {
  const r = resolveServiceContact({ providerUserId: null, existingContactId: null, linkedUserId: null })
  assert.equal(r.kind, 'CREATE_NEW')
})

test('same phone in a NEW neighborhood (no existing contact there) creates a new one', () => {
  // Identity may exist elsewhere, but existingContactId is scoped to the
  // target neighborhood+category — null here → CREATE_NEW (multi-hood).
  const r = resolveServiceContact({ providerUserId: null, existingContactId: null, linkedUserId: null })
  assert.equal(r.kind, 'CREATE_NEW')
})

// ── Extraction from post/comment text ───────────────────────────────
test('extracts a Saudi phone from post text', () => {
  const c = extractPhoneCandidates('سباك ممتاز جربته، رقمه 0512345678 يرد بسرعة')
  assert.equal(c.length, 1)
  assert.equal(c[0].e164, '+966512345678')
})

test('extracts a Saudi phone from a comment with intl form', () => {
  const c = extractPhoneCandidates('تواصل معه +966512345678')
  assert.equal(c[0].e164, '+966512345678')
})

test('multiple distinct numbers are all returned (deduped by E.164)', () => {
  const c = extractPhoneCandidates('0512345678 أو 0556667788 أو نفس الأول 966512345678')
  assert.equal(c.length, 2)
})

test('uncertain category requires manual selection (returns null)', () => {
  assert.equal(inferServiceCategory('رقم زين والله ما أدري وش يسوي'), null)
})

test('clear trade keyword infers the category', () => {
  assert.equal(inferServiceCategory('أحتاج سباك يصلح التسريب'), 'PLUMBER')
  assert.equal(inferServiceCategory('فني تكييف شاطر'), 'AC_TECH')
})

test('extractServiceContact bundles phone + suggestions', () => {
  const e = extractServiceContact('📱 أبو خالد — 0512345678 كهربائي ممتاز')
  assert.equal(e.phones[0].e164, '+966512345678')
  assert.equal(e.suggestedCategory, 'ELECTRICIAN')
  assert.equal(typeof e.suggestedName, 'string')
})

test('inferDisplayName picks the tagged name', () => {
  assert.equal(inferDisplayName('📱 أبو محمد — 0512345678'), 'أبو محمد')
})

// ── Safety ──────────────────────────────────────────────────────────
test('report reasons validate', () => {
  assert.equal(isValidServiceReportReason('WRONG_PHONE'), true)
  assert.equal(isValidServiceReportReason('NOT_THIS_PERSON'), true)
  assert.equal(isValidServiceReportReason('FRAUD_OR_ABUSE'), true)
  assert.equal(isValidServiceReportReason('INAPPROPRIATE'), true)
  assert.equal(isValidServiceReportReason('SPAM'), false)
})

test('verified contacts hide on a higher report threshold than community', () => {
  assert.equal(serviceContactHideThreshold('UNVERIFIED'), 3)
  assert.equal(serviceContactHideThreshold('PENDING_OWNER_CONFIRMATION'), 3)
  assert.equal(serviceContactHideThreshold('VERIFIED'), 5)
  assert.equal(serviceContactHideThreshold('CLAIMED'), 5)
})

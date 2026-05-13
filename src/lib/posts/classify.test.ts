/**
 * Tests for classifyPostCategory.
 *
 * Run:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' \
 *     --test src/lib/posts/classify.test.ts
 *
 * Each test pairs a representative post with the user's selected
 * category and asserts the classifier's resolution. Covers the eight
 * scenarios from the spec plus the critical safety rule (commercial
 * post inside NEIGHBORHOOD_REPORTS gets force-corrected).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyPostCategory } from './classify'

test('food post wrongly submitted as NEIGHBORHOOD_REPORTS → HOME_BUSINESSES (safety override)', () => {
  const r = classifyPostCategory({
    title: 'كيك شوكولاتة بيتي',
    body: 'حلويات بيتي طازجة كيك بسبوسة كنافة قهوة عربية والتوصيل متوفر',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'HOME_BUSINESSES')
  assert.equal(r.action, 'AUTO_CORRECT')
  assert.equal(r.confidence, 'high')
})

test('job post wrongly submitted as SERVICES → MARKETPLACE + JOB', () => {
  const r = classifyPostCategory({
    title: 'مطلوب موظف استقبال',
    body: 'فرصة عمل دوام كامل راتب ثابت مع مكافآت شهرية. ارسلوا السيرة الذاتية',
    selectedCategory: 'SERVICES',
  })
  assert.equal(r.finalCategory, 'MARKETPLACE')
  assert.equal(r.finalMarketplaceType, 'JOB')
  assert.ok(r.action === 'AUTO_CORRECT' || r.action === 'REJECT_WITH_SUGGESTION')
})

test('plumber request → SERVICES + REQUEST', () => {
  const r = classifyPostCategory({
    title: 'أحتاج سباك',
    body: 'محتاج سباك عاجل لتسريب المطبخ، مين يعرف رقم زين؟',
    selectedCategory: 'SERVICES',
  })
  assert.equal(r.finalCategory, 'SERVICES')
  assert.equal(r.finalIntent, 'REQUEST')
  assert.equal(r.action, 'ALLOW')
})

test('plumber offering service → SERVICES + OFFER', () => {
  const r = classifyPostCategory({
    title: 'سباك تحت أمركم',
    body: 'سباك متوفر للحجز كل أنواع الإصلاح والتركيب، اطلب الآن',
    selectedCategory: 'SERVICES',
    selectedIntent: 'OFFER',
  })
  assert.equal(r.finalCategory, 'SERVICES')
  assert.equal(r.finalIntent, 'OFFER')
  assert.equal(r.action, 'ALLOW')
})

test('lost wallet → LOST_FOUND', () => {
  const r = classifyPostCategory({
    title: 'ضاعت محفظتي',
    body: 'فقدت محفظتي بنية اللون فيها بطاقاتي عند البقالة، الله يجزى من وجدها خير',
    selectedCategory: 'LOST_FOUND',
  })
  assert.equal(r.finalCategory, 'LOST_FOUND')
  assert.equal(r.action, 'ALLOW')
})

test('water outage → NEIGHBORHOOD_REPORTS', () => {
  const r = classifyPostCategory({
    title: 'انقطاع المياه',
    body: 'الموية مقطوعة من الصبح بلّغت البلدية، أحد عنده نفس المشكلة؟',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
  assert.equal(r.action, 'ALLOW')
})

test('ambiguous short post → allow selected category without correction', () => {
  const r = classifyPostCategory({
    title: 'سلامو عليكم',
    body: 'مرحبا بالجميع',
    selectedCategory: 'GENERAL',
  })
  assert.equal(r.finalCategory, 'GENERAL')
  assert.equal(r.action, 'ALLOW')
  assert.equal(r.confidence, 'low')
})

test('marketplace SELL post stays as MARKETPLACE/SELL when selected matches', () => {
  const r = classifyPostCategory({
    title: 'جوال آيفون 13 للبيع',
    body: 'آيفون 13 برو نظيف بحالة ممتازة سعر قابل للتفاوض',
    selectedCategory: 'MARKETPLACE',
    selectedMarketplaceType: 'SELL',
  })
  assert.equal(r.finalCategory, 'MARKETPLACE')
  assert.equal(r.finalMarketplaceType, 'SELL')
  assert.equal(r.action, 'ALLOW')
})

test('marketplace post that is actually a JOB → marketplaceType corrected to JOB', () => {
  const r = classifyPostCategory({
    title: 'فرصة عمل سائق توصيل',
    body: 'وظيفة توصيل بدوام كامل راتب مع عمولة، أرسلوا السيرة الذاتية',
    selectedCategory: 'MARKETPLACE',
    selectedMarketplaceType: 'SELL',
  })
  assert.equal(r.finalCategory, 'MARKETPLACE')
  assert.equal(r.finalMarketplaceType, 'JOB')
  assert.equal(r.action, 'AUTO_CORRECT')
})

test('CRITICAL SAFETY: commercial post in NEIGHBORHOOD_REPORTS → moved out', () => {
  // Even with commercial-leaning content like furniture for sale, if
  // the user picks NEIGHBORHOOD_REPORTS we MUST move it out — the
  // category carries HIGH priority by default and that's a known
  // ad-pushing abuse vector.
  const r = classifyPostCategory({
    title: 'أثاث للبيع',
    body: 'كنبة وطاولة طعام للبيع نظيفة بسعر مغري قابل للتفاوض',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.notEqual(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
  assert.equal(r.action, 'AUTO_CORRECT')
})

test('no false-positive: a real safety report that mentions "store" stays in NEIGHBORHOOD_REPORTS', () => {
  // Ensures that incidental commercial vocabulary doesn't drag a real
  // safety report out of NEIGHBORHOOD_REPORTS.
  const r = classifyPostCategory({
    title: 'حريق قرب المتجر',
    body: 'حريق صغير بالقرب من المتجر، الدفاع المدني وصل، انتبهوا',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
})

// ── Phase 0 WhatsApp-group phrasings ───────────────────────────────────
// The زايدي group used a small set of recurring phrases — drivers as
// "سواق", tutors as "معلمة", civic asks like "ممشى" / "يوتيرن" /
// "تشجير", and missing-amenity asks like "مستوصف". These rules cover
// them without inventing new categories.

test('colloquial سواق request → SERVICES + REQUEST', () => {
  const r = classifyPostCategory({
    title: 'محتاج سواق يومي',
    body: 'محتاج سواق يومي للمدرسة الصباح، أي أحد يعرف؟',
    selectedCategory: 'SERVICES',
  })
  assert.equal(r.finalCategory, 'SERVICES')
  assert.equal(r.finalIntent, 'REQUEST')
})

test('colloquial معلمة request → SERVICES + REQUEST', () => {
  const r = classifyPostCategory({
    title: 'محتاجين معلمة تأسيس',
    body: 'أبحث عن معلمة تأسيس لطفلتي، تجي للبيت',
    selectedCategory: 'SERVICES',
  })
  assert.equal(r.finalCategory, 'SERVICES')
  assert.equal(r.finalIntent, 'REQUEST')
})

test('مستودع listing → REAL_ESTATE', () => {
  const r = classifyPostCategory({
    title: 'مستودع للإيجار في الحي',
    body: 'مستودع 200 متر للإيجار قريب من شارع الستين، عقد سنوي',
    selectedCategory: 'REAL_ESTATE',
  })
  assert.equal(r.finalCategory, 'REAL_ESTATE')
})

test('محل listing → REAL_ESTATE', () => {
  const r = classifyPostCategory({
    title: 'محل للإيجار',
    body: 'محل تجاري للإيجار في موقع ممتاز، السعر للتفاوض',
    selectedCategory: 'REAL_ESTATE',
  })
  assert.equal(r.finalCategory, 'REAL_ESTATE')
})

test('civic ممشى proposal → NEIGHBORHOOD_REPORTS (real-estate decoy ignored)', () => {
  // User might mis-pick REAL_ESTATE because "الحي" appears; classifier
  // should pull it into NEIGHBORHOOD_REPORTS via the civic vocabulary.
  const r = classifyPostCategory({
    title: 'نحتاج ممشى في الحي',
    body: 'الحي يحتاج ممشى للعائلات، نتمنى تطوير الأرصفة والإنارة',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
})

test('civic يوتيرن complaint → NEIGHBORHOOD_REPORTS', () => {
  const r = classifyPostCategory({
    title: 'يوتيرن خطر',
    body: 'اليوتيرن قبل المسجد فيه ازدحام شديد ومخاطر، رفعنا شكوى للبلدية',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
})

test('civic تشجير suggestion → NEIGHBORHOOD_REPORTS', () => {
  const r = classifyPostCategory({
    title: 'تشجير الشوارع',
    body: 'حملة تشجير للحي بالتعاون مع البلدية، اقتراح للأمانة',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
})

test('missing مستوصف ask → NEIGHBORHOOD_REPORTS', () => {
  const r = classifyPostCategory({
    title: 'نقص مستوصف في الحي',
    body: 'حيّنا يحتاج مستوصف قريب، أقرب مركز صحي بعيد',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
})

test('place recommendation question stays GENERAL (no false service pull)', () => {
  // "وين أحسن صيدلية" — recommendation ask. Should NOT get pulled into
  // SERVICES or MARKETPLACE; the user picks GENERAL via the Ask tile.
  const r = classifyPostCategory({
    title: 'وين أحسن صيدلية',
    body: 'محتاج صيدلية تفتح متأخر، توصية من الجيران',
    selectedCategory: 'GENERAL',
  })
  assert.equal(r.finalCategory, 'GENERAL')
  assert.equal(r.finalIntent, 'REQUEST')
})

test('place recommendation about مطعم stays GENERAL', () => {
  const r = classifyPostCategory({
    title: 'أحسن مطعم في الحي',
    body: 'أبحث عن توصية لمطعم عائلي قريب، من جربوه؟',
    selectedCategory: 'GENERAL',
  })
  assert.equal(r.finalCategory, 'GENERAL')
  assert.equal(r.finalIntent, 'REQUEST')
})

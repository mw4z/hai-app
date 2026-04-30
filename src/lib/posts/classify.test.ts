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

/**
 * Tests for the Arabic-aware search normalizer.
 *
 *   npx tsx --test src/lib/arabicNormalize.test.ts
 *
 * Pins the variants we promise to fold, the marks we strip,
 * and the idempotency guarantee.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeArabic, matchesArabic } from './arabicNormalize'

// ── Alef family ────────────────────────────────────────────────

test('alef variants all collapse to ا', () => {
  assert.equal(normalizeArabic('أحمد'), 'احمد')
  assert.equal(normalizeArabic('إحمد'), 'احمد')
  assert.equal(normalizeArabic('آحمد'), 'احمد')
  assert.equal(normalizeArabic('ٱحمد'), 'احمد')
  assert.equal(normalizeArabic('احمد'), 'احمد')
})

test('alef inside a word, not just at start', () => {
  assert.equal(normalizeArabic('قرآن'),  'قران')
  assert.equal(normalizeArabic('متأخر'), 'متاخر')
  assert.equal(normalizeArabic('سؤال'),  'سوال')
})

// ── Yaa / alef maksura ─────────────────────────────────────────

test('yaa variants fold to ي', () => {
  assert.equal(normalizeArabic('على'), normalizeArabic('علي'))
  assert.equal(normalizeArabic('عليّ'), normalizeArabic('علي'))
  assert.equal(normalizeArabic('شئون'), 'شيون')
})

// ── Taa marbuta ────────────────────────────────────────────────

test('taa marbuta folds to ه', () => {
  assert.equal(normalizeArabic('مدرسة'), normalizeArabic('مدرسه'))
  assert.equal(normalizeArabic('شركة'),  normalizeArabic('شركه'))
})

// ── Tashkeel + tatweel stripping ───────────────────────────────

test('tashkeel diacritics are stripped', () => {
  assert.equal(normalizeArabic('مَحَلّ'), 'محل')
  assert.equal(normalizeArabic('قِطّة'), 'قطه')
  assert.equal(normalizeArabic('مُؤَذِّن'), 'موذن')
})

test('tatweel (kashida) is removed', () => {
  assert.equal(normalizeArabic('مـحــمد'), 'محمد')
})

// ── Arabic-Indic digits ────────────────────────────────────────

test('Arabic-Indic digits fold to western', () => {
  assert.equal(normalizeArabic('شارع ٤٢'), 'شارع 42')
  assert.equal(normalizeArabic('۱۲۳'), '123') // Persian-Indic
})

// ── Mixed cases users actually type ────────────────────────────

test('real-world Saudi names match across variants', () => {
  // Same place written four different ways — all should be equal.
  const a = normalizeArabic('مطعم أبو علي')
  const b = normalizeArabic('مطعم ابو علي')
  const c = normalizeArabic('مطعم ابو علي ')         // trailing space
  const d = normalizeArabic('مطعمُ أبو عليّ')         // diacritics
  assert.equal(a, b)
  assert.equal(b, c)
  assert.equal(c, d)
})

test('whitespace collapsed and trimmed', () => {
  assert.equal(normalizeArabic('  مطعم   أحمد  '), 'مطعم احمد')
  assert.equal(normalizeArabic('a\tb\n c'), 'a b c')
})

// ── Latin handling ─────────────────────────────────────────────

test('latin text lowercased, otherwise untouched', () => {
  assert.equal(normalizeArabic('SUBWAY'), 'subway')
  assert.equal(normalizeArabic('Al-Salam Market'), 'al-salam market')
})

// ── Idempotency ────────────────────────────────────────────────

test('normalizeArabic is idempotent', () => {
  const samples = [
    'مطعم أبو علي',
    'SUBWAY ١٢٣',
    'Al-Salam',
    'قِطّة',
    '',
    '   ',
  ]
  for (const s of samples) {
    const once = normalizeArabic(s)
    const twice = normalizeArabic(once)
    assert.equal(once, twice, `not idempotent for: ${JSON.stringify(s)}`)
  }
})

// ── Empty / null safety ────────────────────────────────────────

test('empty inputs', () => {
  assert.equal(normalizeArabic(''), '')
  assert.equal(normalizeArabic('   '), '')
})

// ── matchesArabic helper ───────────────────────────────────────

test('matchesArabic — alef-folded substring hits', () => {
  assert.equal(matchesArabic('مطعم أحمد', 'احمد'), true)
  assert.equal(matchesArabic('مطعم احمد', 'أحمد'), true)
  assert.equal(matchesArabic('مدرسة الفجر', 'مدرسه'), true)
})

test('matchesArabic — empty needle matches anything', () => {
  assert.equal(matchesArabic('anything', ''), true)
})

test('matchesArabic — null / undefined haystack misses', () => {
  assert.equal(matchesArabic(null, 'x'), false)
  assert.equal(matchesArabic(undefined, 'x'), false)
})

test('matchesArabic — diacritics in either side cancel out', () => {
  assert.equal(matchesArabic('مَحَلّ السلام', 'محل'), true)
  assert.equal(matchesArabic('محل السلام', 'مَحَلّ'), true)
})

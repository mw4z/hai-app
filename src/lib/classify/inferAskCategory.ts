/**
 * inferAskCategory — v1 rule-based category inference for the Ask
 * Neighbors composer.
 *
 * Scope (kept INTENTIONALLY tiny so this file is easy to delete /
 * replace with the v2 ML version later):
 *   • 7 high-precision keyword patterns
 *   • Default fallback = SERVICES (the most common ask bucket)
 *   • Synchronous, no I/O, no deps — runs in well under 1ms on the
 *     longest realistic Ask text
 *   • Returns ONLY a v2 category — no confidence, no top-N. The UI
 *     pre-selects this category but does NOT lock it: the user can
 *     freely override before submit.
 *
 * V2 (deferred — NOT in this PR):
 *   - Naive Bayes / fastText classifier trained on Post + override logs
 *   - Confidence scores + top-3 suggestions
 *   - Learning loop with override telemetry
 */

import { normalizeArabic } from './normalize'

export type V2Category =
  | 'HOME_BUSINESSES'
  | 'MARKETPLACE'
  | 'SERVICES'
  | 'RIDES'
  | 'REAL_ESTATE'
  | 'LOST_FOUND'
  | 'NEIGHBORHOOD_REPORTS'
  | 'EVENTS'
  | 'COMPETITIONS'

/**
 * Rule order matters — earliest match wins. Higher-specificity buckets
 * are checked first so generic terms like "خدمة" don't shadow a more
 * specific signal like "إيجار".
 */
interface Rule {
  category: V2Category
  /** Compiled once at module load; tested against the normalized text. */
  pattern: RegExp
}

// All patterns operate on text AFTER normalizeArabic() — alif folded to ا,
// yaa to ي, taa-marbouta to ه, diacritics stripped, lowercased.
const RULES: Rule[] = [
  // 1. RIDES — transport / pickup / drop-off
  {
    category: 'RIDES',
    pattern: /(?:مشوار|توصيله|توصيل\s|مواصلات|اوصل|راكب|راكبه|مشاوير|رحله|رحلات|الي\s+المطار|من\s+المطار|طلب\s+توصيل)/,
  },
  // 2. LOST_FOUND — lost or found items
  {
    category: 'LOST_FOUND',
    pattern: /(?:مفقود|مفقوده|مفقودات|ضايع|ضائع|ضايعه|ضائعه|وجدت|لقيت|عثرت|عثر|اضعت|فقدت)/,
  },
  // 3. REAL_ESTATE — rent / sale of housing
  {
    category: 'REAL_ESTATE',
    pattern: /(?:شقه|شقق|فيلا|فلل|عماره|عمارات|دور\s|بيت\s+للبيع|بيت\s+للايجار|للايجار|للبيع\s+شقه|استوديو|مكتب\s+للايجار|محل\s+للايجار|ارض\s+للبيع|عقار|عقارات|سكن|سكنى)/,
  },
  // 4. NEIGHBORHOOD_REPORTS — issues, outages, safety, complaints
  {
    category: 'NEIGHBORHOOD_REPORTS',
    pattern: /(?:انقطاع|بلاغ|مشكله\s+في\s+الحي|حادث|عطل|تسرب|كهرباء\s+مقطوع|ماء\s+مقطوع|اخطار|خطر|سرقه|كسر|تخريب|اشاره\s+معطله)/,
  },
  // 5. EVENTS — gatherings, lectures, ceremonies
  {
    category: 'EVENTS',
    pattern: /(?:مناسبه|مناسبات|حفل|احتفال|محاضره|دروس|دوره\s+تدريبيه|ندوه|اجتماع|تجمع|افطار\s+جماعي|مولود|عقد\s+قران|عرس|زفاف)/,
  },
  // 6. COMPETITIONS — contests with prizes
  {
    category: 'COMPETITIONS',
    pattern: /(?:مسابقه|مسابقات|جايزه|جائزه|جوايز|جوائز|فوز|اسحب|سحب\s+جائزه|تحدي\s+الحي)/,
  },
  // 7. HOME_BUSINESSES — home-cooked food, baking, home crafts
  // (Checked BEFORE MARKETPLACE so "للبيع كبسة" routes to home businesses
  //  instead of generic marketplace.)
  {
    category: 'HOME_BUSINESSES',
    pattern: /(?:كبسه|اكلات\s+بيتيه|طبخ\s+بيتي|خبز\s+بيتي|معجنات|كيك\s+بيتي|حلويات\s+بيتيه|اسر\s+منتجه|اسره\s+منتجه|طبيخ|كاتو|تشيز\s+كيك)/,
  },
  // 8. MARKETPLACE — generic buy/sell of goods (kept last so the more
  //    specific buckets above win when both could match)
  {
    category: 'MARKETPLACE',
    pattern: /(?:للبيع|بيع\s|اشتري|اشتريت|مستعمل|مستعمله|بحاله|عرض\s+سعر|سوق\s|نقد|بطاقه\s+فيزا|اجهزه\s+للبيع)/,
  },
]

export function inferAskCategory(text: string | null | undefined): V2Category {
  if (!text) return 'SERVICES'
  const normalized = normalizeArabic(text)
  if (!normalized) return 'SERVICES'

  for (const rule of RULES) {
    if (rule.pattern.test(normalized)) return rule.category
  }

  // Default — most asks really are "I need a person who does X".
  return 'SERVICES'
}

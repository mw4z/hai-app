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

// ════════════════════════════════════════════════════════════════════════
// Phase 1 — structured subtype metadata
//
// All these tests target the new fields on ClassifyResult:
//   realEstateType / civicType / eventHints / confidenceScore / signals
// The existing finalCategory / finalIntent / finalMarketplaceType
// assertions are still valid — Phase 1 is additive.
// ════════════════════════════════════════════════════════════════════════

// ── REAL_ESTATE subtypes (positive) ─────────────────────────────────────

test('Phase1: apartment for rent → APARTMENT_RENT', () => {
  const r = classifyPostCategory({
    title: 'شقة ٤ غرف للإيجار',
    body: 'شقة فاضية للإيجار في الزايدي، ٤ غرف، صالة، دورتين مياه. السعر للتفاوض.',
    selectedCategory: 'REAL_ESTATE',
  })
  assert.equal(r.finalCategory, 'REAL_ESTATE')
  assert.equal(r.realEstateType, 'APARTMENT_RENT')
})

test('Phase1: apartment for sale → APARTMENT_SALE', () => {
  const r = classifyPostCategory({
    title: 'شقة تمليك للبيع',
    body: 'شقة تمليك ٣ غرف للبيع، تأمين كامل، السعر نهائي.',
    selectedCategory: 'REAL_ESTATE',
  })
  assert.equal(r.finalCategory, 'REAL_ESTATE')
  assert.equal(r.realEstateType, 'APARTMENT_SALE')
})

test('Phase1: villa for rent → VILLA_RENT', () => {
  const r = classifyPostCategory({
    title: 'فيلا للإيجار',
    body: 'فيلا دورين للإيجار السنوي، الموقع ممتاز، مدخلين ومواقف.',
    selectedCategory: 'REAL_ESTATE',
  })
  assert.equal(r.finalCategory, 'REAL_ESTATE')
  assert.equal(r.realEstateType, 'VILLA_RENT')
})

test('Phase1: land for sale → LAND_SALE', () => {
  const r = classifyPostCategory({
    title: 'أرض للبيع',
    body: 'أرض ٦٠٠ متر للبيع، صك إلكتروني، الشارع جنوبي.',
    selectedCategory: 'REAL_ESTATE',
  })
  assert.equal(r.finalCategory, 'REAL_ESTATE')
  assert.equal(r.realEstateType, 'LAND_SALE')
})

test('Phase1: warehouse → WAREHOUSE', () => {
  const r = classifyPostCategory({
    title: 'مستودع للإيجار',
    body: 'مستودع ١٢٠ متر للإيجار، قريب من الطريق الرئيسي.',
    selectedCategory: 'REAL_ESTATE',
  })
  assert.equal(r.finalCategory, 'REAL_ESTATE')
  assert.equal(r.realEstateType, 'WAREHOUSE')
})

test('Phase1: commercial shop with rent modifier → COMMERCIAL_SHOP', () => {
  const r = classifyPostCategory({
    title: 'محل للإيجار على الشارع',
    body: 'محل تجاري للإيجار على الشارع، مساحة جيدة، عقد سنوي.',
    selectedCategory: 'REAL_ESTATE',
  })
  assert.equal(r.finalCategory, 'REAL_ESTATE')
  assert.equal(r.realEstateType, 'COMMERCIAL_SHOP')
})

test('Phase1: wanted apartment → WANTED', () => {
  const r = classifyPostCategory({
    title: 'أبحث عن شقة للإيجار',
    body: 'أبحث عن شقة ٣ غرف للإيجار في الحي، عائلة صغيرة، الميزانية معقولة.',
    selectedCategory: 'REAL_ESTATE',
  })
  assert.equal(r.finalCategory, 'REAL_ESTATE')
  assert.equal(r.realEstateType, 'WANTED')
})

test('Phase1: ملحق للإيجار → APARTMENT_RENT', () => {
  const r = classifyPostCategory({
    title: 'ملحق للإيجار',
    body: 'ملحق علوي للإيجار السنوي، مدخل مستقل، مفروش جزئياً.',
    selectedCategory: 'REAL_ESTATE',
  })
  assert.equal(r.finalCategory, 'REAL_ESTATE')
  assert.equal(r.realEstateType, 'APARTMENT_RENT')
})

// ── REAL_ESTATE subtypes (negative — must NOT misfire) ─────────────────

test('Phase1: store recommendation question → GENERAL, no realEstateType', () => {
  const r = classifyPostCategory({
    title: 'وين محل نظارات قريب؟',
    body: 'أبي محل نظارات في الحي، أحد جربهم؟',
    selectedCategory: 'REAL_ESTATE',
  })
  assert.equal(r.finalCategory, 'GENERAL')
  assert.equal(r.finalIntent, 'REQUEST')
  assert.equal(r.realEstateType ?? null, null)
})

test('Phase1: محل selling product → not REAL_ESTATE', () => {
  const r = classifyPostCategory({
    title: 'محل لبيع جوالات افتتح بالحي',
    body: 'محل يبيع جوالات وملحقاتها فتح قريب من البقالة، أسعار حلوة.',
    selectedCategory: 'GENERAL',
  })
  assert.notEqual(r.finalCategory, 'REAL_ESTATE')
  assert.equal(r.realEstateType ?? null, null)
})

test('Phase1: best real-estate office recommendation → GENERAL', () => {
  const r = classifyPostCategory({
    title: 'أفضل مكتب عقاري؟',
    body: 'ترشحون مكتب عقاري ممتاز في الحي؟ نبي نأجر بيت قريب.',
    selectedCategory: 'REAL_ESTATE',
  })
  assert.equal(r.finalCategory, 'GENERAL')
  assert.equal(r.realEstateType ?? null, null)
})

test('Phase1: low-signal real-estate title → no subtype written', () => {
  const r = classifyPostCategory({
    title: 'شقة',
    body: 'شقة',
    selectedCategory: 'REAL_ESTATE',
  })
  assert.equal(r.realEstateType ?? null, null)
})

// ── NEIGHBORHOOD_REPORTS civicType subtypes ──────────────────────────────

test('Phase1: U-turn hazard → TRAFFIC_SAFETY', () => {
  const r = classifyPostCategory({
    title: 'اليوتيرن عند المدرسة خطر',
    body: 'اليوتيرن قبل المدرسة خطر جداً، سيارات متهورة وسرعة عالية.',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
  assert.equal(r.civicType, 'TRAFFIC_SAFETY')
})

test('Phase1: speed bumps proposal → PROPOSAL', () => {
  const r = classifyPostCategory({
    title: 'نحتاج مطبات',
    body: 'نقترح إضافة مطبات على الشارع الرئيسي، السيارات تطير، نطالب البلدية.',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
  assert.equal(r.civicType, 'PROPOSAL')
})

test('Phase1: pothole in street → INFRASTRUCTURE', () => {
  const r = classifyPostCategory({
    title: 'حفرة في الشارع',
    body: 'فيه حفرة كبيرة بالشارع الجانبي، السفلتة متضررة، نحتاج رصف عاجل.',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
  assert.equal(r.civicType, 'INFRASTRUCTURE')
})

test('Phase1: walkway proposal → PROPOSAL', () => {
  const r = classifyPostCategory({
    title: 'نحتاج ممشى في الحي',
    body: 'الحي يحتاج ممشى للعائلات، نقترح حملة تطوير مع البلدية.',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
  assert.equal(r.civicType, 'PROPOSAL')
})

test('Phase1: tree-planting initiative → PROPOSAL', () => {
  const r = classifyPostCategory({
    title: 'مبادرة تشجير',
    body: 'نقترح حملة تشجير للحي بالتعاون مع الأمانة، فريق تطوعي مفتوح.',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
  assert.equal(r.civicType, 'PROPOSAL')
})

test('Phase1: garbage / sanitation → ENVIRONMENT', () => {
  const r = classifyPostCategory({
    title: 'نفايات متراكمة',
    body: 'النفايات متراكمة عند الحاوية من أسبوع، الروائح ما تنطاق.',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
  assert.equal(r.civicType, 'ENVIRONMENT')
})

test('Phase1: missing clinic → PROPOSAL or PUBLIC_SERVICES', () => {
  const r = classifyPostCategory({
    title: 'نحتاج مستوصف',
    body: 'الحي يحتاج مستوصف قريب، أقرب مركز صحي بعيد.',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
  assert.ok(r.civicType === 'PROPOSAL' || r.civicType === 'PUBLIC_SERVICES',
    `expected PROPOSAL or PUBLIC_SERVICES, got ${r.civicType}`)
})

test('Phase1: wrong-way driving → TRAFFIC_SAFETY', () => {
  const r = classifyPostCategory({
    title: 'عكس السير خطر',
    body: 'سيارات تروح عكس السير عند تقاطع الإشارة، حادث وشيك.',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
  assert.equal(r.civicType, 'TRAFFIC_SAFETY')
})

test('Phase1: flooding / sewage → INFRASTRUCTURE', () => {
  const r = classifyPostCategory({
    title: 'السيول دخلت البيت',
    body: 'تصريف المياه ضعيف، السيول دخلت البيت بعد المطر، نحتاج رصف وتصريف.',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
  assert.equal(r.civicType, 'INFRASTRUCTURE')
})

test('Phase1: ongoing complaint → COMPLAINT', () => {
  const r = classifyPostCategory({
    title: 'مشكلة مستمرة وشكوى',
    body: 'متضرر من المشكلة من شهر، رفعت شكوى رسمية وما فيه تجاوب، الموضوع سيء.',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
  assert.equal(r.civicType, 'COMPLAINT')
})

test('Phase1: missing street lighting → INFRASTRUCTURE', () => {
  const r = classifyPostCategory({
    title: 'إنارة الشارع مفقودة',
    body: 'الشارع الجانبي مظلم تماماً، الإنارة معطلة من أسبوع، اللمبات مكسورة.',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
  assert.equal(r.civicType, 'INFRASTRUCTURE')
})

test('Phase1: stray cats → ENVIRONMENT', () => {
  const r = classifyPostCategory({
    title: 'قطط سايبة كثيرة',
    body: 'قطط سايبة وكلاب سايبة بكثرة عند الحاوية، خطر على الأطفال.',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
  assert.equal(r.civicType, 'ENVIRONMENT')
})

test('Phase1: bus-stop request → PUBLIC_SERVICES', () => {
  const r = classifyPostCategory({
    title: 'موقف باص',
    body: 'الحي بدون موقف باص، النقل العام بعيد عنا.',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
  assert.equal(r.civicType, 'PUBLIC_SERVICES')
})

test('Phase1: explicit "نطالب" wording → PROPOSAL', () => {
  const r = classifyPostCategory({
    title: 'نطالب بحملة تطوير',
    body: 'نطالب البلدية بحملة تطوير شاملة للحي، الأرصفة والإنارة والتشجير.',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.finalCategory, 'NEIGHBORHOOD_REPORTS')
  assert.equal(r.civicType, 'PROPOSAL')
})

// ── SERVICES (Phase 1 — confidence behavior) ─────────────────────────────

test('Phase1: plumber request → SERVICES + REQUEST + signals array exists', () => {
  const r = classifyPostCategory({
    title: 'أحتاج سباك',
    body: 'محتاج سباك عاجل لتسريب المطبخ.',
    selectedCategory: 'SERVICES',
  })
  assert.equal(r.finalCategory, 'SERVICES')
  assert.equal(r.finalIntent, 'REQUEST')
  // signals[] is populated by the subtype inferrer (REAL_ESTATE /
  // NEIGHBORHOOD_REPORTS / EVENTS). SERVICES doesn't infer a subtype,
  // so signals may be empty — assert presence of the array only.
  assert.ok(Array.isArray(r.signals))
})

test('Phase1: AC technician request → SERVICES', () => {
  const r = classifyPostCategory({
    title: 'أحتاج فني تكييف',
    body: 'فني تكييف لصيانة المكيف، الفلتر يحتاج تنظيف.',
    selectedCategory: 'SERVICES',
  })
  assert.equal(r.finalCategory, 'SERVICES')
})

test('Phase1: tutor request "معلمة تأسيس" → SERVICES + REQUEST', () => {
  const r = classifyPostCategory({
    title: 'أحتاج معلمة تأسيس',
    body: 'معلمة تأسيس لطفلتي ابتدائي، تجي البيت.',
    selectedCategory: 'SERVICES',
  })
  assert.equal(r.finalCategory, 'SERVICES')
  assert.equal(r.finalIntent, 'REQUEST')
})

test('Phase1: school-transport recurring service → SERVICES OFFER', () => {
  const r = classifyPostCategory({
    title: 'توصيل مدارس شهري',
    body: 'سواق يقدم توصيل مدارس شهري للبنات، خبرة طويلة.',
    selectedCategory: 'SERVICES',
    selectedIntent: 'OFFER',
  })
  assert.equal(r.finalCategory, 'SERVICES')
  assert.equal(r.finalIntent, 'OFFER')
})

test('Phase1: government-paperwork office → SERVICES', () => {
  const r = classifyPostCategory({
    title: 'مكتب خدمات إلكترونية',
    body: 'تعقيب رخص، تجديد إقامة، تقديم جامعات، خدمات إلكترونية كاملة.',
    selectedCategory: 'SERVICES',
    selectedIntent: 'OFFER',
  })
  assert.equal(r.finalCategory, 'SERVICES')
})

test('Phase1: hourly cleaners offer → SERVICES', () => {
  const r = classifyPostCategory({
    title: 'عاملات بالساعة',
    body: 'شركة تنظيف، عاملات بالساعة، أسعار مناسبة.',
    selectedCategory: 'SERVICES',
    selectedIntent: 'OFFER',
  })
  assert.equal(r.finalCategory, 'SERVICES')
})

// ── MARKETPLACE — JOB subtype + buy/sell ─────────────────────────────────

test('Phase1: iPhone for sale → MARKETPLACE SELL', () => {
  const r = classifyPostCategory({
    title: 'للبيع آيفون نظيف',
    body: 'آيفون ١٣ نظيف للبيع، مع علبته، السعر للتفاوض.',
    selectedCategory: 'MARKETPLACE',
    selectedMarketplaceType: 'SELL',
  })
  assert.equal(r.finalCategory, 'MARKETPLACE')
  assert.equal(r.finalMarketplaceType, 'SELL')
})

test('Phase1: buying AC → MARKETPLACE BUY', () => {
  const r = classifyPostCategory({
    title: 'أبغى أشتري مكيف مستعمل',
    body: 'مطلوب شراء مكيف نظيف بحالة جيدة.',
    selectedCategory: 'MARKETPLACE',
    selectedMarketplaceType: 'BUY',
  })
  assert.equal(r.finalCategory, 'MARKETPLACE')
  assert.equal(r.finalMarketplaceType, 'BUY')
})

test('Phase1: hiring women workers → MARKETPLACE JOB', () => {
  const r = classifyPostCategory({
    title: 'مطلوب موظفات بوفيه',
    body: 'مطلوب موظفات بوفيه، دوام كامل، راتب مقابل خبرة.',
    selectedCategory: 'MARKETPLACE',
  })
  assert.equal(r.finalCategory, 'MARKETPLACE')
  assert.equal(r.finalMarketplaceType, 'JOB')
})

test('Phase1: seasonal Hajj work seeker → MARKETPLACE JOB', () => {
  const r = classifyPostCategory({
    title: 'أحتاج وظيفة بالحج',
    body: 'أحتاج وظيفة موسمية بالحج، خبرة سابقة، تصريح متوفر.',
    selectedCategory: 'SERVICES',
  })
  assert.equal(r.finalCategory, 'MARKETPLACE')
  assert.equal(r.finalMarketplaceType, 'JOB')
})

test('Phase1: clippers for sale → MARKETPLACE SELL', () => {
  const r = classifyPostCategory({
    title: 'ماكينة حلاقة للبيع',
    body: 'ماكينة حلاقة احترافية للبيع، استخدام بسيط.',
    selectedCategory: 'MARKETPLACE',
    selectedMarketplaceType: 'SELL',
  })
  assert.equal(r.finalCategory, 'MARKETPLACE')
  assert.equal(r.finalMarketplaceType, 'SELL')
})

// ── HOME_BUSINESSES ─────────────────────────────────────────────────────

test('Phase1: grape leaves OFFER → HOME_BUSINESSES', () => {
  const r = classifyPostCategory({
    title: 'متوفر ورق عنب اليوم',
    body: 'ورق عنب طازج للحجز، التوصيل داخل الحي، بيتي.',
    selectedCategory: 'HOME_BUSINESSES',
    selectedIntent: 'OFFER',
  })
  assert.equal(r.finalCategory, 'HOME_BUSINESSES')
  assert.equal(r.finalIntent, 'OFFER')
})

test('Phase1: pre-order breakfast → HOME_BUSINESSES', () => {
  const r = classifyPostCategory({
    title: 'حجز فطور من الليل',
    body: 'فطور بيتي، حجز من الليل، شكشوكة، فول، تميس.',
    selectedCategory: 'HOME_BUSINESSES',
  })
  assert.equal(r.finalCategory, 'HOME_BUSINESSES')
})

test('Phase1: who makes cake → HOME_BUSINESSES REQUEST', () => {
  const r = classifyPostCategory({
    title: 'مين يسوي كيك مناسبات؟',
    body: 'أبحث عن أحد يسوي كيك للمناسبات، توصية من جربتوها.',
    selectedCategory: 'HOME_BUSINESSES',
  })
  assert.equal(r.finalCategory, 'HOME_BUSINESSES')
  assert.equal(r.finalIntent, 'REQUEST')
})

test('Phase1: generic "أكل بيتي" → HOME_BUSINESSES', () => {
  const r = classifyPostCategory({
    title: 'أكل بيتي',
    body: 'محتاج أسر منتجة قريبة تسوي أكل بيتي، اطلبوا.',
    selectedCategory: 'HOME_BUSINESSES',
  })
  assert.equal(r.finalCategory, 'HOME_BUSINESSES')
})

// ── LOST_FOUND ──────────────────────────────────────────────────────────

test('Phase1: lost key → LOST_FOUND', () => {
  const r = classifyPostCategory({
    title: 'ضاع مفتاح',
    body: 'فقدت مفتاح البيت قرب البقالة بعد العصر.',
    selectedCategory: 'LOST_FOUND',
  })
  assert.equal(r.finalCategory, 'LOST_FOUND')
})

test('Phase1: found cat → LOST_FOUND', () => {
  const r = classifyPostCategory({
    title: 'لقيت قطة',
    body: 'لقيت قطة شيرازية بيضا عند الحديقة، صاحبها يكلمني.',
    selectedCategory: 'LOST_FOUND',
  })
  assert.equal(r.finalCategory, 'LOST_FOUND')
})

test('Phase1: lost wallet → LOST_FOUND', () => {
  const r = classifyPostCategory({
    title: 'فقدت محفظتي',
    body: 'فقدت محفظتي البنية اليوم بعد المغرب، فيها بطاقاتي.',
    selectedCategory: 'LOST_FOUND',
  })
  assert.equal(r.finalCategory, 'LOST_FOUND')
})

// ── EVENTS — best-effort hints ──────────────────────────────────────────

test('Phase1: Friday walk → EVENTS', () => {
  const r = classifyPostCategory({
    title: 'فعالية مشي الجمعة',
    body: 'فعالية مشي صباح الجمعة عند الممشى، الدعوة عامة للأهالي، الساعة ٧.',
    selectedCategory: 'EVENTS',
  })
  assert.equal(r.finalCategory, 'EVENTS')
})

test('Phase1: Wednesday training course → EVENTS', () => {
  const r = classifyPostCategory({
    title: 'دورة تدريبية الأربعاء',
    body: 'دورة تدريبية للأهالي يوم الأربعاء، التسجيل قبل المغرب، شهادة حضور.',
    selectedCategory: 'EVENTS',
  })
  assert.equal(r.finalCategory, 'EVENTS')
})

test('Phase1: neighborhood meeting → EVENTS', () => {
  const r = classifyPostCategory({
    title: 'اجتماع أهل الحي',
    body: 'اجتماع لقاء أهل الحي لمناقشة المبادرات، الموقع جامع الحي.',
    selectedCategory: 'EVENTS',
  })
  assert.equal(r.finalCategory, 'EVENTS')
})

test('Phase1: productive-families bazaar → EVENTS', () => {
  const r = classifyPostCategory({
    title: 'بازار الأسر المنتجة',
    body: 'بازار للأسر المنتجة، معرض منتجات منزلية، الدعوة عامة.',
    selectedCategory: 'EVENTS',
  })
  assert.equal(r.finalCategory, 'EVENTS')
})

// ── RIDES / DELIVERY guard ──────────────────────────────────────────────

test('Phase1: ride to Shawqia → not MARKETPLACE', () => {
  const r = classifyPostCategory({
    title: 'أحتاج مشوار للشوقية',
    body: 'محتاج توصيلة للشوقية بعد العصر، الأجرة معقولة.',
    selectedCategory: 'RIDES',
  })
  assert.notEqual(r.finalCategory, 'MARKETPLACE')
})

test('Phase1: delivery to Dammam → not MARKETPLACE', () => {
  const r = classifyPostCategory({
    title: 'أحد رايح الدمام يوصل غرض؟',
    body: 'أحد رايح الدمام بكرة عندي علبة صغيرة، الأجرة كاش.',
    selectedCategory: 'RIDES',
  })
  assert.notEqual(r.finalCategory, 'MARKETPLACE')
  assert.notEqual(r.finalCategory, 'SERVICES')
})

test('Phase1: school-transport monthly service → SERVICES', () => {
  const r = classifyPostCategory({
    title: 'سواق توصيل مدارس شهري',
    body: 'سواق متوفر لتوصيل المدارس بشكل شهري، تواصل خاص.',
    selectedCategory: 'SERVICES',
    selectedIntent: 'OFFER',
  })
  assert.equal(r.finalCategory, 'SERVICES')
})

// ── GENERAL — recommendation guard ──────────────────────────────────────

test('Phase1: best Bukhari restaurant → GENERAL REQUEST', () => {
  const r = classifyPostCategory({
    title: 'أفضل مطعم بخاري؟',
    body: 'ترشحون أحسن مطعم بخاري قريب من الحي؟ تجاربكم.',
    selectedCategory: 'GENERAL',
  })
  assert.equal(r.finalCategory, 'GENERAL')
  assert.equal(r.finalIntent, 'REQUEST')
})

test('Phase1: where is an open pharmacy → GENERAL', () => {
  const r = classifyPostCategory({
    title: 'وين صيدلية مفتوحة؟',
    body: 'محتاج صيدلية تفتح متأخر، توصية من الجيران.',
    selectedCategory: 'GENERAL',
  })
  assert.equal(r.finalCategory, 'GENERAL')
})

test('Phase1: recommend a car wash → never REAL_ESTATE', () => {
  const r = classifyPostCategory({
    title: 'تنصحون بمغسلة سيارات قريبة؟',
    body: 'محتاج مغسلة سيارات جيدة، تجاربكم؟',
    selectedCategory: 'GENERAL',
  })
  assert.notEqual(r.finalCategory, 'REAL_ESTATE')
  assert.equal(r.realEstateType ?? null, null)
})

test('Phase1: recommend a cafe → GENERAL', () => {
  const r = classifyPostCategory({
    title: 'ترشحون كافيه هادي؟',
    body: 'كافيه هادي للقراءة، أحد يعرف مكان قريب؟',
    selectedCategory: 'GENERAL',
  })
  assert.equal(r.finalCategory, 'GENERAL')
})

// ── Confidence boundary checks ──────────────────────────────────────────

test('Phase1: confidenceScore numeric exists', () => {
  const r = classifyPostCategory({
    title: 'شقة للإيجار',
    body: 'شقة جميلة للإيجار في الزايدي.',
    selectedCategory: 'REAL_ESTATE',
  })
  assert.ok(typeof r.confidenceScore === 'number')
})

test('Phase1: signals[] populated for confident classifications', () => {
  const r = classifyPostCategory({
    title: 'يوتيرن خطر',
    body: 'يوتيرن قبل المدرسة فيه حوادث متكررة، الإشارة معطلة.',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.ok(Array.isArray(r.signals))
  assert.ok((r.signals?.length ?? 0) > 0)
})

test('Phase1: cross-category — REAL_ESTATE post never carries civicType', () => {
  const r = classifyPostCategory({
    title: 'شقة للإيجار',
    body: 'شقة للإيجار قريب من البلدية.',
    selectedCategory: 'REAL_ESTATE',
  })
  assert.equal(r.civicType ?? null, null)
})

test('Phase1: cross-category — NEIGHBORHOOD_REPORTS never carries realEstateType', () => {
  const r = classifyPostCategory({
    title: 'حفرة في الشارع قرب الشقة',
    body: 'حفرة عميقة عند مدخل العمارة، البلدية ما تجاوبت.',
    selectedCategory: 'NEIGHBORHOOD_REPORTS',
  })
  assert.equal(r.realEstateType ?? null, null)
})

test('Phase1: cross-category — GENERAL post carries no subtypes', () => {
  const r = classifyPostCategory({
    title: 'سلامو عليكم',
    body: 'مرحبا بالجميع.',
    selectedCategory: 'GENERAL',
  })
  assert.equal(r.realEstateType ?? null, null)
  assert.equal(r.civicType ?? null, null)
})

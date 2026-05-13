/**
 * Server-side category classifier for POST /api/posts.
 *
 * Strategy: deterministic keyword + intent-marker scoring against the
 * title + body. Each category accumulates a score from matched terms.
 * The final action depends on the relationship between the user's
 * selected category and the top-scoring category:
 *
 *   - top score < MIN_SIGNAL  → ALLOW (we have no signal; trust user)
 *   - selected matches top    → ALLOW
 *   - selected mismatches top
 *       AND top score ≥ STRONG → AUTO_CORRECT (silent move + toast)
 *       AND top score ≥ MEDIUM → REJECT_WITH_SUGGESTION (confirm dialog)
 *       else                   → ALLOW (ambiguous)
 *
 * Hard rule: any commercial signal in NEIGHBORHOOD_REPORTS is force-
 * corrected to the closest commercial category — abuse vector for
 * pushing ads with HIGH priority.
 *
 * No external AI. No DB calls. Pure function. Auditable.
 */

import type { PostCategory, PostIntent, MarketplaceType, RealEstateType, CivicType } from '@prisma/client'
import {
  normalizeArabicForMatch,
  scoreRules as scoreDictRules,
  RECOMMENDATION_RULES,
  REAL_ESTATE_COMMERCIAL_SHOP_RULES,
  RIDES_RULES as RIDES_DICT_RULES,
} from './classifyDictionaries'
import { inferPostMetadata, SUBTYPE_WRITE_THRESHOLD } from './classifyMetadata'

export type ClassifyAction = 'ALLOW' | 'AUTO_CORRECT' | 'REJECT_WITH_SUGGESTION'

export interface ClassifyResult {
  finalCategory: PostCategory
  finalIntent: PostIntent
  finalMarketplaceType: MarketplaceType  // SELL by default; only meaningful for MARKETPLACE
  action: ClassifyAction
  confidence: 'low' | 'medium' | 'high'
  reason: string
  /** When action ≠ ALLOW, this is the category we suggest. */
  suggestedCategory?: PostCategory
  // ── Phase 1 additive fields (all optional — existing callers ignore safely)
  /** Real-estate subtype, only populated when finalCategory='REAL_ESTATE'
   *  AND confidenceScore ≥ SUBTYPE_WRITE_THRESHOLD. */
  realEstateType?: RealEstateType | null
  /** Civic subtype, only populated when finalCategory='NEIGHBORHOOD_REPORTS'
   *  AND confidenceScore ≥ SUBTYPE_WRITE_THRESHOLD. */
  civicType?: CivicType | null
  /** Best-effort event date/location hints, only populated when
   *  finalCategory='EVENTS'. Always optional — never blocks publish. */
  eventHints?: { startAt: Date | null; endAt: Date | null; location: string | null }
  /** 0..1 normalized confidence over the inferred subtype path. The
   *  per-field write decision lives in the API; the classifier is just
   *  honest about how sure it is. */
  confidenceScore?: number
  /** Matched rule labels — debug visibility. Trimmed to first 16. */
  signals?: string[]
}

export interface ClassifyInput {
  title: string
  body: string
  selectedCategory: PostCategory
  selectedIntent?: PostIntent
  selectedMarketplaceType?: MarketplaceType
}

/* ── Score thresholds ──────────────────────────────────────────────── */
const MIN_SIGNAL = 2
const MEDIUM     = 4
const STRONG     = 7

/* ── Keyword tables ────────────────────────────────────────────────────
 * Arabic + English. Matched as whole-word patterns where possible.
 * Weights reflect how diagnostic each term is. Weight 3 = strong,
 * weight 2 = decent, weight 1 = weak.
 */

interface Rule {
  pattern: RegExp
  weight: number
}

const FOOD_HOME_RULES: Rule[] = [
  // Cooking + meal staples
  { pattern: /(?:طبخ|طبخة|طباخة|طبّاخة|شيف|خبازة|أكلات|اكلات|مأكولات|ماكولات|أكل|اكل|وجبات|وجبة|وجبات\s*فردية|عائلية|باكج|صحن|صواني)/i, weight: 3 },
  { pattern: /(?:غداء|عشاء|فطور|سحور|إفطار|افطار|رز|كبسة|برياني|مندي|منسف|مكبوس)/i, weight: 3 },
  // Sweets + bakery
  { pattern: /(?:حلويات|حلى|كيك|كيكة|كيكات|كوكيز|براونيز|تشيزكيك|بسبوسة|كنافة|كنافه|معمول|تمر|مخبوزات|خبز|فطاير|معجنات|بيتزا|سمبوسة)/i, weight: 3 },
  // Drinks + hospitality
  { pattern: /(?:قهوة|قهوجية|شاي|ضيافة|بوفيه|تقديم|عصير)/i, weight: 3 },
  // Home-business framing
  { pattern: /(?:أسرة\s*منتجة|اسرة\s*منتجة|بيتي|منزلي|طبخ\s*بيتي|شغل\s*منزلي|اسوي|نسوي|نجهز|صناعة\s*منزلية)/i, weight: 3 },
  // Ordering / delivery flow
  { pattern: /(?:طلب\s*مسبق|حجز|تجهيز|توصيل\s*يومي|توصيل\s*للبيت|كاترينج|كيترنج|توصيل\s*أكل|توصيل\s*اكل)/i, weight: 3 },
  // Occasions
  { pattern: /(?:عزيمة|مناسبات|حفلات|مواليد|زواج)/i, weight: 2 },
  // Menu / pricing language
  { pattern: /(?:اسعار|أسعار|قائمة|منيو|اطلب|اطلب\s*الآن|اطلب\s*الان|تواصل|طلب\s*واتساب)/i, weight: 1 },
  // Diet / health-food framing
  { pattern: /(?:اكل\s*صحي|أكل\s*صحي|دايت|رجيم|عضلات|بروتين)/i, weight: 2 },
  // English
  { pattern: /(?:home\s*food|home\s*cook(?:ing|ed)?|home\s*made|homemade)/i, weight: 3 },
  { pattern: /(?:catering|dessert|cake|cakes|coffee|tea|juice|baking|baked)/i, weight: 2 },
  { pattern: /(?:meal|meals|breakfast|lunch|dinner|iftar|suhoor)/i, weight: 2 },
]

const MARKETPLACE_RULES: Rule[] = [
  // Sell verbs / framing — adds "خصم|عروض|عرض\s*خاص" so an opened-shop
  // post like "افتتحنا محل عبايات وعندنا خصم" lands as MARKETPLACE
  // instead of staying in GENERAL.
  { pattern: /(?:للبيع|للبيـع|أبيع|ابيع|بيع|عرض|معروض|عرض\s*للبيع|على\s*البيع|للبيع\s*فوري|تخفيض|تصفية|حراج|سومة|خصم|خصومات|عروض|عرض\s*خاص)/i, weight: 3 },
  // Buy framing
  { pattern: /(?:أبغى\s*اشتري|ابغى\s*اشتري|أبي\s*اشتري|ابي\s*اشتري|طلب\s*شراء|مطلوب|شراء)/i, weight: 3 },
  // Condition descriptors
  { pattern: /(?:نظيف|مستعمل|جديد|شبه\s*جديد|بحالة\s*ممتازة|بحالة\s*جيدة)/i, weight: 1 },
  // Pricing
  { pattern: /(?:سعر|بسعر|السعر|كم\s*السعر|تفاوض|قابل\s*للتفاوض|قابل\s*للنقاش|سعر\s*نهائي|كاش)/i, weight: 2 },
  // Logistics
  { pattern: /(?:توصيل|شحن|استلام|تسليم|الموقع|قريب|بعيد)/i, weight: 1 },
  // Furniture / appliances
  { pattern: /(?:اثاث|أثاث|سرير|كنبة|طاولة|مكتب|كرسي|دولاب|مطبخ|غسالة|ثلاجة|فرن|مكيف)/i, weight: 2 },
  // Electronics
  { pattern: /(?:جوال|آيفون|ايفون|سامسونج|لابتوب|كمبيوتر|شاشة|تابلت|سماعة|شاحن|تلفزيون|تلفاز)/i, weight: 2 },
  // Auto parts (the cars themselves are still MARKETPLACE)
  { pattern: /(?:سيارة|سياره|قطع\s*غيار|كفرات|بطارية|زيوت|اكسسوارات)/i, weight: 2 },
  // Apparel + accessories. Includes "عبايات" plural — match-side
  // singular/plural variants are kept explicit because classify.ts
  // matches raw (un-normalized) text.
  { pattern: /(?:ملابس|شنطة|جزمة|عباية|عبايات|فستان|نظارات|ساعات)/i, weight: 2 },
  // Contact framing common in marketplace listings
  { pattern: /(?:واتساب|تواصل\s*خاص|خاص\s*واتساب)/i, weight: 1 },
  // Buying — Arabic (weak — many of these appear in services too)
  { pattern: /(?:أبغى|ابغى|أبي|ابي|محتاج|أدور|ادور|أبحث\s*عن|ابحث\s*عن|عند\s*أحد)/i, weight: 1 },
  // English
  { pattern: /(?:for\s*sale|selling|sell|buy|buying|second\s*hand|used)/i, weight: 3 },
  { pattern: /(?:phone|iphone|samsung|laptop|tv|chair|table|fridge|sofa|bed|furniture)/i, weight: 2 },
  { pattern: /(?:price|negotiable|sar|ريال)/i, weight: 2 },
]

const JOB_RULES: Rule[] = [
  // Arabic — employer posting
  { pattern: /(?:فرصة\s*عمل|وظيفة|وظائف|مطلوب\s*موظف|مطلوب\s*موظفة|مطلوب\s*موظفات|مطلوب\s*عامل|مطلوب\s*عمالة|مطلوب\s*سائق|مطلوب\s*محاسب)/i, weight: 3 },
  // "تقديم" alone was too generic — collides with government-paperwork
  // offices ("تقديم جامعات / تقديم وظائف") which are SERVICES, not JOB
  // postings. The JOB-specific phrases are caught by the seasonal rule
  // ("للتقديم / رابط التقديم") below.
  { pattern: /(?:توظيف|تعيين|راتب|الراتب|دوام|دوام\s*كامل|دوام\s*جزئي|دوام\s*صباحي|دوام\s*مسائي)/i, weight: 3 },
  { pattern: /(?:شفت|شفتات|عقد|عقد\s*عمل|مؤقت|سيرة\s*ذاتية|السيرة\s*الذاتية|cv|سي\s*في)/i, weight: 3 },
  // Seasonal / KSA-specific job context — Hajj season is the biggest
  // job spike of the year; "وظيفة بالحج / موسم الحج / تصريح / إقامة"
  // co-occur in these listings.
  { pattern: /(?:موسمي|موسمية|الحج|بالحج|موسم\s*الحج|تصريح|إقامة|اقامة|الجنسيات|للتقديم|رابط\s*التقديم|ارسال\s*السيرة)/i, weight: 3 },
  { pattern: /(?:خبرة|الخبرة|خبرات|بخبرة)/i, weight: 2 },
  // English
  { pattern: /(?:job|jobs|hiring|hire|employment|vacancy|position|career|salary|shift|recruit(?:ing|ment)?)/i, weight: 3 },
  { pattern: /(?:full[-\s]*time|part[-\s]*time|contract|cv|resume)/i, weight: 3 },
]

// SERVICES — provider category. Keywords are profession names + "I
// need / I offer" framing.
const SERVICES_RULES: Rule[] = [
  // Trades — includes colloquial Hejazi/Saudi spellings the WhatsApp
  // group used (سواق, معلمة, معلّم, ميكانيكي, فني تكييف). Diacritics
  // optional — RegExp covers both with the explicit alternates.
  { pattern: /(?:سباك|سباكة|كهربائي|كهرباء|نجار|نجارة|دهان|دهانات|حداد|حدادة|بلاط|سيراميك|بناء|بنّاء|بناي|لحام|تصليح|فني|فني\s*تكييف|ميكانيكي|ميكانيكا)/i, weight: 3 },
  // Maintenance / appliances
  { pattern: /(?:مكيف|تكييف|صيانة|اصلاح|إصلاح|تركيب|فك|نقل)/i, weight: 3 },
  // Cleaning / household help
  { pattern: /(?:تنظيف|نظافة|عاملة|عاملات|عاملة\s*منزلية|عامل\s*نظافة|عاملات\s*بالساعة|خادمة|شغالة|شركة\s*تنظيف|مكافحة\s*حشرات)/i, weight: 3 },
  // Moving / driving services (when offered as a service business).
  // Includes WhatsApp colloquial "سواق" alongside formal "سائق".
  { pattern: /(?:نقل\s*عفش|سائق|سواق|مشاوير|مشوار|شحن|توصيل)/i, weight: 2 },
  // Personal care
  { pattern: /(?:حلاق|كوافير|صالون|مكياج|عناية|عناية\s*بالبشرة)/i, weight: 3 },
  // Tutoring / teaching — "معلمة" / "معلّمة" / "مدرّسة" colloquial
  // forms common in the WhatsApp group for tutor requests.
  { pattern: /(?:مدرس|مدرّس|مدرسة|مدرّسة|معلم|معلّم|معلمة|معلّمة|خصوصي|دروس|شرح|تعليم|تأسيس|محفظ|محفظة)/i, weight: 3 },
  // Media / digital services
  { pattern: /(?:تصوير|مصور|فيديو|مونتاج|برمجة|تصميم|موقع|تطبيق|سوشال\s*ميديا)/i, weight: 3 },
  // Auto services
  { pattern: /(?:غسيل\s*سيارات|تلميع|بنشر|بطارية)/i, weight: 2 },
  // Service framing — REQUEST side
  { pattern: /(?:طلب\s*خدمة|احتاج\s*سباك|أحتاج\s*سباك|مين\s*يعرف\s*كهربائي|ادور\s*فني)/i, weight: 3 },
  // Service framing — OFFER side
  { pattern: /(?:عرض\s*خدمة|نقدم\s*خدمات|نوفر|عندي\s*خدمة|أقدم\s*خدمة|اقدم\s*خدمة|أوفر|اوفر)/i, weight: 2 },
  // Generic "service" word — weak signal
  { pattern: /(?:خدمة|خدمات|توفر)/i, weight: 1 },
  // English
  { pattern: /(?:plumber|plumbing|electrician|electrical|carpenter|painter|cleaning|cleaner|maintenance|repair|handyman|technician|installation)/i, weight: 3 },
  { pattern: /(?:service|services|offering|provide|provider)/i, weight: 1 },
]

// REQUEST markers (intent=REQUEST). Apply to SERVICES, RIDES, and others.
const REQUEST_MARKERS: Rule[] = [
  { pattern: /(?:أحتاج|احتاج|محتاج|أبغى|ابغى|أبي|ابي|مين\s*يعرف|من\s*يعرف|أدور|ادور|أبحث\s*عن|ابحث\s*عن|ضروري|ضرووري|عاجل)/i, weight: 3 },
  { pattern: /(?:need|needed|looking\s*for|urgent(?:ly)?|asap|please\s*help)/i, weight: 3 },
]

const OFFER_MARKERS: Rule[] = [
  { pattern: /(?:أوفر|اوفر|أقدم|اقدم|متوفر|متاح|تواصل|تواصلوا|للحجز|اطلب\s*الآن|اطلب\s*الان)/i, weight: 2 },
  // Explicit promotional language ("خصم / تخفيض / عندنا / للبيع")
  // pushes intent to OFFER even when the post text is otherwise short.
  // Lifts "افتتحنا محل عبايات وعندنا خصم" from NORMAL to OFFER.
  { pattern: /(?:خصم|خصومات|تخفيض|تصفية|عروض|عرض\s*خاص|عندنا|للبيع|اطلبوا|احجزوا)/i, weight: 3 },
  { pattern: /(?:offering|available|book\s*now|order\s*now|i\s*provide|i\s*offer|discount|sale|deal)/i, weight: 2 },
]

const LOST_FOUND_RULES: Rule[] = [
  { pattern: /(?:ضاع|ضاعت|ضايع|فقدت|مفقود|مفقودة|لقيت|وجدت|تم\s*العثور|عثرت|عثرت\s*على|حصلت|اختفى|انسرق|بحثت|مالقيت)/i, weight: 3 },
  { pattern: /(?:محفظة|جوال|مفاتيح|شنطة|بطاقة|هوية|اقامة|إقامة|كلب|قط|قطة|طير|حيوان)/i, weight: 1 },
  { pattern: /(?:صاحبه|صاحبها|يرجى\s*التواصل|اللي\s*يعرف|يدل|يوصل|يرجع|موجود\s*عندي|استلم|تسليم|مكافأة|جائزة|تعويض)/i, weight: 2 },
  { pattern: /(?:lost|found|missing)/i, weight: 3 },
  { pattern: /(?:wallet|cat|dog|keys|phone|id\s*card|passport)/i, weight: 1 },
]

const EVENTS_RULES: Rule[] = [
  // "مناسبة" intentionally removed — collides with "مناسبة" meaning
  // "appropriate" (e.g. "أسعار مناسبة"). "مناسبات" (plural) is keep —
  // it always means occasions.
  { pattern: /(?:فعالية|فعاليات|حدث|مهرجان|نشاط|تجمع|لقاء|اجتماع|حفل|حفلة|احتفال|مناسبات)/i, weight: 3 },
  { pattern: /(?:دعوة|حضور|تسجيل|حجز|انضم|شارك|سجل|احجز)/i, weight: 2 },
  { pattern: /(?:يوم\s*مفتوح|بازار|معرض|سوق\s*خيري)/i, weight: 3 },
  { pattern: /(?:دورة|ورشة|تدريب|محاضرة|ندوة|جلسة|نادي|مدرسة)/i, weight: 2 },
  { pattern: /(?:مسابقة|بطولة|دوري)/i, weight: 2 },
  { pattern: /(?:تاريخ|موعد|الساعة|المكان)/i, weight: 1 },
  { pattern: /(?:الدخول\s*مجاني|برسوم|تذاكر)/i, weight: 2 },
  { pattern: /(?:عائلي|نسائي|رجالي|للاطفال|للأطفال)/i, weight: 1 },
  { pattern: /(?:تراويح|عيد|رمضان|اليوم\s*الوطني|مولد|عقد\s*قران|عرس|تخرج)/i, weight: 3 },
  { pattern: /(?:event|gathering|meeting|celebration|festival|party|seminar|workshop|class|invite)/i, weight: 3 },
]

const NEIGHBORHOOD_REPORTS_RULES: Rule[] = [
  // Note: تسريب (leak) is intentionally NOT here — it overlaps with
  // plumbing requests. Real outage reports use انقطاع / عطل.
  // Generic alert framing
  { pattern: /(?:بلاغ|مشكلة|خطر|انتبهوا|انتبهو|تحذير|احذروا|تنبيه)/i, weight: 3 },
  // Theft / suspicious activity
  { pattern: /(?:سرقة|حرامي|محاولة\s*سرقة|مشتبه|مشبوه|اعتداء)/i, weight: 3 },
  // Traffic / accidents
  { pattern: /(?:حادث|تصادم|انقلاب|طريق\s*مغلق|شارع\s*مغلق|اغلاق|زحمة)/i, weight: 3 },
  // Utilities / outages
  { pattern: /(?:انقطاع|انقطعت|عطل|خراب|كهرباء\s*طافية|مويه\s*مقطوعة|شبكة\s*ضعيفة|إنارة|انارة)/i, weight: 3 },
  // Construction nuisance
  { pattern: /(?:حفريات|اعمال|أعمال|ازعاج|إزعاج|ضوضاء|حفرة|مطب|كسر)/i, weight: 2 },
  // Animal hazards
  { pattern: /(?:كلب\s*ضال|حيوان\s*خطير|قطط\s*مريضة)/i, weight: 3 },
  // Sanitation
  { pattern: /(?:نفايات|وسخ|رائحة|روائح|ريحة|صرف\s*صحي)/i, weight: 2 },
  // Authority routes (signals a real report)
  { pattern: /(?:بلدية|أمانة|امانة|تبليغ|اتصلت\s*الشرطة|الشرطة|الدفاع\s*المدني|شكوى|رفع\s*شكوى|ضرر)/i, weight: 2 },
  // Urban development / civic-proposal vocabulary lifted from the
  // زايدي WhatsApp group: U-turns, walkways, tree-planting, missing
  // clinics. These are CIVIC topics — not commercial — so they route
  // here. (Phase 1 will introduce a civicType subtype; for now they
  // just land in NEIGHBORHOOD_REPORTS.)
  { pattern: /(?:ممشى|ممشاة|يوتيرن|يو\s*تيرن|تطوير|تشجير|أشجار|اشجار|سواد|تجميل\s*الحي)/i, weight: 3 },
  { pattern: /(?:مستوصف|مستوصفات|مركز\s*صحي|عيادة\s*مفقودة|عيادة\s*ناقصة|نقص\s*خدمات)/i, weight: 3 },
  { pattern: /(?:إنارة\s*مفقودة|انارة\s*مفقودة|رصيف|أرصفة|ارصفة|نقل\s*عام|محطة\s*باص)/i, weight: 2 },
  // Child safety
  { pattern: /(?:اطفال\s*ضايعين|أطفال\s*ضايعين|خطر\s*على\s*الاطفال|خطر\s*على\s*الأطفال)/i, weight: 3 },
  // Fire / emergency
  { pattern: /(?:دخان|حريق|نار|طوارئ|انفجار)/i, weight: 3 },
  // Urgency framing common in reports (low weight — also appears in
  // help-requests, so don't over-weight)
  { pattern: /(?:رجاء\s*الانتباه|يا\s*جماعة|اللي\s*ساكنين|مساعدة\s*عاجلة|عاجل|ضروري)/i, weight: 1 },
  // Location-noun boost — paired with the "خطر / مشكلة / تحذير" alert
  // rule above it, this lifts "الشارع عند الصيدلية خطر" from below
  // MEDIUM (just +3) to ≥ MEDIUM (+4), so the classifier suggests
  // NEIGHBORHOOD_REPORTS instead of allowing a casual GENERAL post.
  // Weight 1 each so common mentions on non-civic posts (e.g. "للبيع
  // شقة في الشارع 60") don't dominate their actual category.
  { pattern: /(?:الشارع|الشوارع|الطريق|الطرق|التقاطع|الإشارة|الاشارة|أمام|امام)/i, weight: 1 },
  { pattern: /(?:عند\s*المدرسة|عند\s*المسجد|عند\s*الحديقة|عند\s*التقاطع|في\s*الحي)/i, weight: 1 },
  // English
  { pattern: /(?:outage|leak|fire|smoke|smell|hazard|warning|danger|suspicious|theft|broken|pothole|road\s*closed|power\s*cut|water\s*cut)/i, weight: 3 },
]

const RIDES_RULES: Rule[] = [
  { pattern: /(?:مشوار|مشاوير|توصيلة|توصيل|راكب|راكبة|سائق|مع\s*السائق)/i, weight: 3 },
  { pattern: /(?:ابغى\s*مشوار|أبغى\s*مشوار|محتاج\s*مشوار|اوصلني|أوصلني|رايح|جاي|طريق|وجهة)/i, weight: 3 },
  { pattern: /(?:من\s*\S+\s*الى|الى\s*\S+|يومي)/i, weight: 1 },
  { pattern: /(?:ride|lift|carpool|drive|driver)/i, weight: 3 },
]

const REAL_ESTATE_RULES: Rule[] = [
  // Property types. NOTE: "محل" / "محلات" intentionally NOT here —
  // bare "محل" matches store-recommendation questions ("وين محل
  // نظارات") which would falsely promote to REAL_ESTATE. The
  // COMMERCIAL_SHOP path lives in classifyDictionaries.ts where it
  // requires محل + a rent/sale modifier (للإيجار / فاضي / على الشارع
  // / تجاري). The tenure modifier rule below ("ايجار / للايجار / ...")
  // still puts "محل للإيجار" cleanly in REAL_ESTATE because rent fires.
  { pattern: /(?:شقة|شقه|غرفة|دور|فيلا|فلة|استراحة|عمارة|مستودع|مستودعات)/i, weight: 3 },
  // Rent / sale framing
  { pattern: /(?:ايجار|إيجار|للايجار|للإيجار|تمليك|عقار|أرض|قطعة\s*أرض|قطعة\s*ارض|للبيع\s*أرض|للبيع\s*ارض|أرض\s*للبيع|ارض\s*للبيع)/i, weight: 3 },
  // Lease structure
  { pattern: /(?:عقد|سنوي|شهري|دفعة|تأمين|سعر\s*الايجار)/i, weight: 2 },
  // Layout / amenities
  { pattern: /(?:غرفتين|ثلاث\s*غرف|صالة|مطبخ|حمام|مؤثث|غير\s*مؤثث)/i, weight: 2 },
  // Location
  { pattern: /(?:موقع|حي|قريب\s*من)/i, weight: 1 },
  // Utilities
  { pattern: /(?:عداد|كهرباء|ماء|مويه)/i, weight: 1 },
  // Real-estate roles
  { pattern: /(?:سمسار|مكتب\s*عقار|عائلة|عزاب)/i, weight: 2 },
  { pattern: /(?:متاح|شاغر|جاهز)/i, weight: 1 },
  { pattern: /(?:apartment|villa|flat|rent|rental|for\s*rent|real\s*estate|property|land\s*for\s*sale)/i, weight: 3 },
]

const COMPETITIONS_RULES: Rule[] = [
  { pattern: /(?:مسابقة|جائزة|جوائز|فائز|اربح|اشترك\s*في\s*المسابقة)/i, weight: 3 },
  { pattern: /(?:contest|competition|prize|winner|giveaway|raffle)/i, weight: 3 },
]

/* ── Scoring ───────────────────────────────────────────────────────── */

function scoreRules(text: string, rules: Rule[]): number {
  let s = 0
  for (const r of rules) {
    if (r.pattern.test(text)) s += r.weight
  }
  return s
}

interface Scores {
  HOME_BUSINESSES: number
  MARKETPLACE: number
  SERVICES: number
  RIDES: number
  REAL_ESTATE: number
  LOST_FOUND: number
  NEIGHBORHOOD_REPORTS: number
  EVENTS: number
  COMPETITIONS: number
  GENERAL: number
  // Sub-signals (not categories)
  JOB: number
  REQUEST: number
  OFFER: number
}

function computeScores(text: string): Scores {
  return {
    HOME_BUSINESSES:      scoreRules(text, FOOD_HOME_RULES),
    MARKETPLACE:          scoreRules(text, MARKETPLACE_RULES),
    SERVICES:             scoreRules(text, SERVICES_RULES),
    RIDES:                scoreRules(text, RIDES_RULES),
    REAL_ESTATE:          scoreRules(text, REAL_ESTATE_RULES),
    LOST_FOUND:           scoreRules(text, LOST_FOUND_RULES),
    NEIGHBORHOOD_REPORTS: scoreRules(text, NEIGHBORHOOD_REPORTS_RULES),
    EVENTS:               scoreRules(text, EVENTS_RULES),
    COMPETITIONS:         scoreRules(text, COMPETITIONS_RULES),
    GENERAL:              0,
    JOB:                  scoreRules(text, JOB_RULES),
    REQUEST:              scoreRules(text, REQUEST_MARKERS),
    OFFER:                scoreRules(text, OFFER_MARKERS),
  }
}

const CATEGORY_KEYS: PostCategory[] = [
  'HOME_BUSINESSES',
  'MARKETPLACE',
  'SERVICES',
  'RIDES',
  'REAL_ESTATE',
  'LOST_FOUND',
  'NEIGHBORHOOD_REPORTS',
  'EVENTS',
  'COMPETITIONS',
]

function topCategory(s: Scores): { cat: PostCategory; score: number } {
  let best: PostCategory = 'GENERAL'
  let bestScore = 0
  for (const k of CATEGORY_KEYS) {
    if (s[k] > bestScore) { bestScore = s[k]; best = k }
  }
  return { cat: best, score: bestScore }
}

/**
 * Commercial-leaning categories — these can never be force-allowed
 * inside NEIGHBORHOOD_REPORTS. The hard safety rule: no commercial
 * post may sit inside a high-priority category.
 */
const COMMERCIAL: ReadonlySet<PostCategory> = new Set<PostCategory>([
  'MARKETPLACE',
  'HOME_BUSINESSES',
  'REAL_ESTATE',
  'SERVICES',
])

/* ── Public API ────────────────────────────────────────────────────── */

/**
 * Public entry point. Runs the existing decision logic (`classifyPostCore`)
 * then enriches the result with Phase 1 subtype metadata. Existing
 * call sites that read only the original fields continue to work
 * unchanged — the new fields are optional.
 */
export function classifyPostCategory(input: ClassifyInput): ClassifyResult {
  const base = classifyPostCore(input)
  const meta = inferPostMetadata({
    title: input.title,
    body: input.body,
    category: base.finalCategory,
  })
  const strong = (meta.confidenceScore ?? 0) >= SUBTYPE_WRITE_THRESHOLD
  return {
    ...base,
    realEstateType:
      base.finalCategory === 'REAL_ESTATE' && strong
        ? meta.realEstateType
        : null,
    civicType:
      base.finalCategory === 'NEIGHBORHOOD_REPORTS' && strong
        ? meta.civicType
        : null,
    eventHints:
      base.finalCategory === 'EVENTS'
        ? meta.eventHints
        : { startAt: null, endAt: null, location: null },
    confidenceScore: meta.confidenceScore,
    signals: [
      ...(base.signals ?? []),
      ...meta.signals,
    ].slice(0, 16),
  }
}

/** Internal: the original decision pipeline. Returns category +
 *  intent + marketplaceType + action without the Phase 1 subtype
 *  enrichment. Public callers should use classifyPostCategory. */
function classifyPostCore(input: ClassifyInput): ClassifyResult {
  const text = `${input.title || ''} \n ${input.body || ''}`
  const scores = computeScores(text)
  const top = topCategory(scores)

  // Phase 1 short-circuit guards run AGAINST the normalized text from
  // classifyDictionaries so they see canonical forms (شقّة, شقه, شقة all
  // collapse to شقه). They never *invent* a category — they only
  // SUPPRESS REAL_ESTATE / MARKETPLACE when the post is clearly a
  // recommendation question, and only PROMOTE COMMERCIAL_SHOP into the
  // REAL_ESTATE bucket when محل is paired with a rent/sale modifier.
  const normalizedForGuards = normalizeArabicForMatch(text)
  const recScore = scoreDictRules(normalizedForGuards, RECOMMENDATION_RULES).score
  // Guard threshold is MEDIUM (not STRONG) so a clear recommendation
  // question ("وين محل نظارات قريب؟" = wen(3) + place(1) = 4) trips
  // the short-circuit. The category-dominance gates below still keep
  // genuinely commercial / real-estate posts in their own buckets.
  const recIsStrong = recScore >= MEDIUM
  const ridesScore = scoreDictRules(normalizedForGuards, RIDES_DICT_RULES).score
  const commercialShopPaired = scoreDictRules(normalizedForGuards, REAL_ESTATE_COMMERCIAL_SHOP_RULES).score > 0

  // Guard A — GENERAL recommendation question:
  // "أفضل مطعم بخاري" / "وين محل نظارات قريب" / "ترشحون كافيه".
  // Strong recommendation phrasing + no DOMINANT sell/buy/service
  // signal → GENERAL+REQUEST.
  //
  // Threshold split:
  //   - HOME_BUSINESSES uses MEDIUM (4) — keeps "كيك مناسبات + توصية"
  //     (HOME_BUSINESSES ≈ 5) in HOME_BUSINESSES.
  //   - SERVICES / MARKETPLACE / REAL_ESTATE use STRONG (7) — a single
  //     incidental noun ("نظارات" → MARKETPLACE 4, "عقاري" → REAL_ESTATE
  //     6) shouldn't block the guard. Genuine listings hit STRONG
  //     because they pair noun + verb ("للبيع آيفون", "شقة للإيجار").
  //   - commercialShopPaired (محل + rent modifier) explicitly defers
  //     to REAL_ESTATE.COMMERCIAL_SHOP — never fires the guard.
  if (recIsStrong &&
      scores.HOME_BUSINESSES < MEDIUM &&
      scores.SERVICES < STRONG &&
      scores.MARKETPLACE < STRONG &&
      scores.REAL_ESTATE < STRONG &&
      !commercialShopPaired) {
    return {
      finalCategory: 'GENERAL',
      finalIntent: 'REQUEST',
      finalMarketplaceType: 'SELL',
      action: 'ALLOW',
      confidence: 'high',
      reason: 'Recommendation question — routed to GENERAL+REQUEST so the REQUESTS chip surfaces it.',
      confidenceScore: 0.90,
      signals: ['guard:recommendation'],
    }
  }

  // Guard B — Delivery-as-RideRequest: strong ride/delivery signal
  // belongs on /rides/new, never as a Post. If the user managed to
  // submit it as a Post anyway, refuse to misclassify it as
  // MARKETPLACE/SERVICES — fall through to whichever non-commercial
  // category scores highest (usually RIDES). The composer flow already
  // routes ride/delivery taps to /rides/new (Phase 0).
  // Implementation: we just trust the existing scoring — RIDES_RULES
  // (legacy) + our dict-level signal — but mark this in `signals` for
  // debugging. No actual override needed; existing behaviour is fine.
  // Left as a placeholder for visibility.
  void ridesScore

  // JOB sub-detection — only matters when the WINNER is MARKETPLACE
  // OR when the user already selected MARKETPLACE.
  const looksLikeJob = scores.JOB >= MEDIUM
  let resolvedMarketplaceType: MarketplaceType = input.selectedMarketplaceType ?? 'SELL'

  // Intent resolution from request/offer markers. The REQUEST rule
  // table is small and a single hit (weight 3) is decisive — lower
  // threshold than the category MEDIUM. OFFER markers stay at the
  // higher bar because OFFER is the default intent for sellers.
  const INTENT_TRIGGER = 3
  let resolvedIntent: PostIntent = input.selectedIntent ?? 'NORMAL'
  if (scores.REQUEST >= INTENT_TRIGGER && scores.REQUEST > scores.OFFER) {
    resolvedIntent = 'REQUEST'
  } else if (scores.OFFER >= INTENT_TRIGGER && scores.OFFER > scores.REQUEST) {
    resolvedIntent = 'OFFER'
  }

  /* ── JOB-dominant signal ─────────────────────────────────────────
     JOB language ("فرصة عمل / دوام / راتب / hiring") may not
     activate any one category strongly because it doesn't sound
     like SELL or BUY — but it's clearly a Marketplace JOB. Promote
     it BEFORE the low-signal early return. */
  if (looksLikeJob && scores.JOB > top.score) {
    if (input.selectedCategory === 'MARKETPLACE' && input.selectedMarketplaceType === 'JOB') {
      // User already self-identified as JOB; just allow.
      return {
        finalCategory: 'MARKETPLACE',
        finalIntent: resolvedIntent,
        finalMarketplaceType: 'JOB',
        action: 'ALLOW',
        confidence: scores.JOB >= STRONG ? 'high' : 'medium',
        reason: 'Selected MARKETPLACE/JOB matches the dominant signal.',
      }
    }
    // When the user is ALREADY on MARKETPLACE and the only correction
    // is the marketplaceType field (SELL/BUY → JOB), that's a tiny
    // nudge, not a category move — auto-correct without asking. Full
    // category moves (e.g. SERVICES → MARKETPLACE/JOB) still require
    // STRONG signal for silent move; otherwise confirm.
    const sameCategory = input.selectedCategory === 'MARKETPLACE'
    const action =
      sameCategory ? 'AUTO_CORRECT'
      : (scores.JOB >= STRONG ? 'AUTO_CORRECT' : 'REJECT_WITH_SUGGESTION')
    return {
      finalCategory: 'MARKETPLACE',
      finalIntent: resolvedIntent,
      finalMarketplaceType: 'JOB',
      action,
      confidence: scores.JOB >= STRONG ? 'high' : 'medium',
      reason: 'Job-posting language detected; routes to MARKETPLACE / JOB.',
      suggestedCategory: 'MARKETPLACE',
    }
  }

  /* ── Critical safety: NEIGHBORHOOD_REPORTS must not be commercial ── */
  if (input.selectedCategory === 'NEIGHBORHOOD_REPORTS' && COMMERCIAL.has(top.cat) && top.score >= MEDIUM) {
    if (top.cat === 'MARKETPLACE' && looksLikeJob) {
      resolvedMarketplaceType = 'JOB'
    }
    return {
      finalCategory: top.cat,
      finalIntent: resolvedIntent,
      finalMarketplaceType: resolvedMarketplaceType,
      action: 'AUTO_CORRECT',
      confidence: 'high',
      reason: `Selected NEIGHBORHOOD_REPORTS but content is commercial (${top.cat}); safety override.`,
      suggestedCategory: top.cat,
    }
  }

  /* ── Low signal: trust the user ─────────────────────────────────── */
  if (top.score < MIN_SIGNAL) {
    return {
      finalCategory: input.selectedCategory,
      finalIntent: resolvedIntent,
      finalMarketplaceType:
        input.selectedCategory === 'MARKETPLACE' ? resolvedMarketplaceType : 'SELL',
      action: 'ALLOW',
      confidence: 'low',
      reason: 'No strong category signal; allowing user selection.',
    }
  }

  /* ── Selected matches top: ALLOW ─────────────────────────────────── */
  // Special case: user picked SERVICES but content reads as MARKETPLACE+JOB.
  // Treat as mismatch even if SERVICES has some score (job posts often
  // mention "shift / dawam" which lights up SERVICES weakly).
  if (input.selectedCategory === 'SERVICES' && looksLikeJob && scores.JOB > scores.SERVICES) {
    return {
      finalCategory: 'MARKETPLACE',
      finalIntent: resolvedIntent,
      finalMarketplaceType: 'JOB',
      action: scores.JOB >= STRONG ? 'AUTO_CORRECT' : 'REJECT_WITH_SUGGESTION',
      confidence: scores.JOB >= STRONG ? 'high' : 'medium',
      reason: 'Job-posting language detected; belongs in MARKETPLACE with marketplaceType=JOB.',
      suggestedCategory: 'MARKETPLACE',
    }
  }

  if (input.selectedCategory === top.cat) {
    // For MARKETPLACE: also align marketplaceType from JOB signal if
    // the user selected SELL but content is clearly a job.
    if (input.selectedCategory === 'MARKETPLACE' && looksLikeJob && resolvedMarketplaceType !== 'JOB') {
      return {
        finalCategory: 'MARKETPLACE',
        finalIntent: resolvedIntent,
        finalMarketplaceType: 'JOB',
        action: 'AUTO_CORRECT',
        confidence: 'high',
        reason: 'Content reads as a job opportunity; corrected marketplaceType to JOB.',
        suggestedCategory: 'MARKETPLACE',
      }
    }
    return {
      finalCategory: input.selectedCategory,
      finalIntent: resolvedIntent,
      finalMarketplaceType:
        input.selectedCategory === 'MARKETPLACE' ? resolvedMarketplaceType : 'SELL',
      action: 'ALLOW',
      confidence: top.score >= STRONG ? 'high' : 'medium',
      reason: 'Selected category matches the dominant content signal.',
    }
  }

  /* ── Mismatch: decide AUTO_CORRECT vs REJECT_WITH_SUGGESTION ───── */
  // Compute the user-selected category's own score for comparison.
  const selectedScore = scores[input.selectedCategory] ?? 0
  // If user's pick has any positive signal AND top is only medium,
  // ambiguous — let the user confirm rather than silently moving.
  if (top.score >= STRONG && selectedScore < MEDIUM) {
    // Strong winner, weak user pick → silent move.
    if (top.cat === 'MARKETPLACE' && looksLikeJob) {
      resolvedMarketplaceType = 'JOB'
    }
    return {
      finalCategory: top.cat,
      finalIntent: resolvedIntent,
      finalMarketplaceType: resolvedMarketplaceType,
      action: 'AUTO_CORRECT',
      confidence: 'high',
      reason: `Strong ${top.cat} signal; selected ${input.selectedCategory} did not match.`,
      suggestedCategory: top.cat,
    }
  }
  if (top.score >= MEDIUM) {
    if (top.cat === 'MARKETPLACE' && looksLikeJob) {
      resolvedMarketplaceType = 'JOB'
    }
    return {
      finalCategory: top.cat,
      finalIntent: resolvedIntent,
      finalMarketplaceType: resolvedMarketplaceType,
      action: 'REJECT_WITH_SUGGESTION',
      confidence: 'medium',
      reason: `Content suggests ${top.cat}; asking the user to confirm.`,
      suggestedCategory: top.cat,
    }
  }

  // Fallback: ambiguous, allow user pick.
  return {
    finalCategory: input.selectedCategory,
    finalIntent: resolvedIntent,
    finalMarketplaceType:
      input.selectedCategory === 'MARKETPLACE' ? resolvedMarketplaceType : 'SELL',
    action: 'ALLOW',
    confidence: 'low',
    reason: 'Signal too ambiguous to override the user.',
  }
}

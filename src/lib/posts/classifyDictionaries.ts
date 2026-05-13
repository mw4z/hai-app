/**
 * Centralized keyword/phrase tables for the post classifier and the
 * Phase 1 subtype metadata inferrer. One file, additive entries,
 * scored uniformly so neither classify.ts nor classifyMetadata.ts has
 * to grow regex-spaghetti in its business logic.
 *
 * All patterns are tested against the OUTPUT of
 * `normalizeArabicForMatch(text)`. The normalization is one-way and
 * destructive only for matching purposes — the user's text is stored
 * un-normalized so display stays faithful (no reversed Arabic, no
 * fused ta-marbouta in the post body).
 *
 *   normalizeArabicForMatch:
 *     trim
 *     strip zero-width (U+200B…U+200D, U+2060, U+FEFF)
 *     أ / إ / آ  → ا
 *     ى          → ي
 *     ة          → ه          (matching only — see DESIGN NOTE below)
 *     remove tatweel ـ
 *     collapse whitespace
 *     lowercase Latin
 *
 * DESIGN NOTE on ة→ه:
 *   We collapse ta-marbouta to ha in the MATCH-side string only. The
 *   original post body / title is never rewritten — that would
 *   silently change user content. The conversion is unidirectional
 *   (ة → ه, never ه → ة) so the normalizer is idempotent and we don't
 *   accidentally rewrite words containing legitimate ه. This makes
 *   pairs like "مدرسة / مدرسه" and "معلمة / معلمه" hit the same key
 *   without us needing two entries per dictionary line.
 */

/* ─── Normalization ─────────────────────────────────────────────────── */

const ZERO_WIDTH = /[​‌‍⁠﻿]/g
const TATWEEL = /ـ/g
const ALIF_VARIANTS = /[أإآ]/g // أ إ آ
const YA_VARIANTS = /ى/g                 // ى
const TA_MARBUTA = /ة/g                  // ة → ه (match-side only)
// Combining diacritics: fatha, kasra, damma, sukun, shaddah, tanwins,
// hamza-above, and dagger alif (U+0670). Strip from the match-side
// only; user text keeps them verbatim for display.
const DIACRITICS = /[ً-ٰٟ]/g

export function normalizeArabicForMatch(input: string): string {
  if (!input) return ''
  return input
    .replace(ZERO_WIDTH, '')
    .replace(DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(ALIF_VARIANTS, 'ا')  // ا
    .replace(YA_VARIANTS, 'ي')    // ي
    .replace(TA_MARBUTA, 'ه')     // ه — match-side ONLY
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/* ─── Rule shape ─────────────────────────────────────────────────────── */

export interface Rule {
  pattern: RegExp
  weight: number
  /** Optional human-readable signal label that lands in result.signals[]
   *  for debug visibility. If absent, we derive it from the pattern. */
  signal?: string
}

function r(pattern: RegExp, weight: number, signal?: string): Rule {
  return { pattern, weight, signal }
}

/* ─── Intent: REQUEST ────────────────────────────────────────────────── */
// AR phrasings (formal + Hejazi/Najdi/Egyptian colloquial). Each line is
// a hot-word group; weight 3 if it's an unambiguous request marker, 1–2
// if it could appear in declarative text.

export const REQUEST_RULES: Rule[] = [
  // Strong "I need" / "I want" verbs
  r(/(?:ابي|أبي|ابغا|أبغا|ابغى|أبغى|ابغي|أبغي|بغيت|بغينا|اريد|أريد|احتاج|أحتاج|محتاج|محتاجه|محتاجه|نحتاج|نبي|نبغى|ودي)\b/i, 3, 'request:need-verb'),
  r(/\b(?:مطلوب|مطلوبه|مطلوبة)\b/i, 3, 'request:wanted'),
  // "Looking for" / "searching"
  r(/(?:ابحث\s*عن|أبحث\s*عن|ادور|أدور|ابغى\s*القى|ابي\s*القى|وين\s*احصل|وين\s*القى|فين\s*احصل|من\s*يدلني|اللي\s*يدلني)/i, 3, 'request:looking-for'),
  // "Who knows / has?"
  r(/(?:مين\s*يعرف|من\s*يعرف|اللي\s*يعرف|الي\s*يعرف|احد\s*يعرف|أحد\s*يعرف|مين\s*عنده|احد\s*عنده|عندكم|في\s*احد|هل\s*يوجد|فيه)\b/i, 3, 'request:who-knows'),
  // Help / advice asks
  r(/(?:دلوني|دلونا|افيدوني|تكفون|ضروري|ضرووري|اللي\s*يدلني|من\s*يساعد|محتاج\s*مساعدة)/i, 2, 'request:help'),
  // "Need a number / location / contact"
  r(/(?:احتاج\s*رقم|ابي\s*رقم|ابغى\s*رقم|ابغى\s*موقع|ابي\s*موقع|عندي\s*طلب|طلب\s*بسيط)/i, 2, 'request:contact'),
  // "Need a service / someone who can"
  r(/(?:احتاج\s*خدمة|ابي\s*خدمة|ابي\s*احد|مين\s*يقدر|احد\s*يقدر|احتاج\s*توصية|احتاج\s*ترشيح)/i, 3, 'request:service-need'),
  // English / Hinglish / Urdu
  r(/\b(?:need|needed|looking\s*for|searching\s*for|want|wanted|recommend|recommendation|where\s*can\s*i\s*find|where\s*to\s*find|required|urgent(?:ly)?|asap|please\s*help)\b/i, 3, 'request:en-need'),
  r(/\b(?:driver\s*needed|plumber\s*needed|teacher\s*needed|electrician\s*needed)\b/i, 3, 'request:en-need-prof'),
  r(/\b(?:chahiye|zaroorat|koi\s*hai|kahan\s*milega)\b/i, 3, 'request:ur-need'),
]

/* ─── Intent: OFFER ──────────────────────────────────────────────────── */

export const OFFER_RULES: Rule[] = [
  // Availability / "we have / we offer"
  r(/(?:متوفر|متوفره|متوفرة|متاح|متاحه|متاحة|يوجد\s*لدينا|عندنا|نوفر|نقدم|متواجدين|دوامنا|موقعنا|فرع|فروع)/i, 2, 'offer:available'),
  // Sale / offer / discount language
  r(/(?:للبيع|عرض|عروض|خصم|تخفيض|تصفية|كميه\s*محدوده|كمية\s*محدودة|جديد|وصل\s*حديثا)/i, 3, 'offer:sale'),
  // "Order now / contact / book"
  r(/(?:للحجز|للطلب|اطلب\s*الآن|اطلب\s*الان|اطلب|تواصل|تواصلوا|واتساب|حياكم|نرحب\s*بكم|نستقبل\s*طلبات)/i, 2, 'offer:order'),
  // Service offering framing
  r(/(?:نقدم\s*خدمة|نقدم\s*خدمات|خدماتنا|نوفر\s*خدمة|عندي\s*خدمة|اقدم\s*خدمة|أقدم\s*خدمة)/i, 2, 'offer:service'),
  // Generic price/SAR (weak — also appears in BUY asks)
  r(/(?:السعر|الاسعار|الأسعار|ريال|ر\.س|sar)/i, 1, 'offer:price'),
  // English
  r(/\b(?:available|for\s*sale|offer|discount|sale|order\s*now|contact\s*us|we\s*provide|service\s*available|delivery\s*available|new\s*arrival)\b/i, 3, 'offer:en'),
]

/* ─── GENERAL recommendation guard ──────────────────────────────────── */
// Phrases that signal the user is asking the neighborhood for a place
// recommendation, NOT trying to buy/rent/hire. These short-circuit
// REAL_ESTATE / MARKETPLACE classification when paired with a place
// noun and no rent/sale modifier.

export const RECOMMENDATION_RULES: Rule[] = [
  r(/(?:افضل|أفضل|احسن|أحسن|وش\s*افضل|ايش\s*افضل|اي(?:ش|ه)\s*احسن)/i, 3, 'rec:best'),
  r(/(?:ترشحون|ترشحوني|تنصحون|تنصحوني|نصيحه|نصيحة|توصيه|توصية)/i, 3, 'rec:recommend'),
  r(/(?:مين\s*جرب|من\s*جرب|تجاربكم|تجربه|تجربة|تقييم|رايكم|رأيكم|وش\s*رايكم|اي(?:ش|ه)\s*رايكم)/i, 3, 'rec:experience'),
  // Interrogative locators — "وين / فين / أين" mark a where-question.
  // Distinct from the prior place-noun rule below so the two can stack
  // ("وين محل نظارات في الحي" = wen +2 + place +1 = 3 → adds to the
  // guard's MEDIUM threshold).
  r(/(?:^|\s)(?:وين|فين|اين|أين)(?:\s|$)/i, 3, 'rec:wen'),
  r(/(?:هل\s*فيه|احد\s*يعرف\s*مكان|اماكن|اقرب|قريب|قريبه|قريبة|قريب\s*من\s*هنا|في\s*الحي|بالحي)/i, 1, 'rec:place'),
  r(/(?:جربت|جربها|ممتاز|سيء|سيئ|غالي|رخيص|يستاهل|ما\s*يستاهل|عاجبني|ما\s*عجبني)/i, 1, 'rec:opinion'),
  // English
  r(/\b(?:best|good|nearby|near\s*me|any\s*recommendation|recommend\s*me|reviews?)\b/i, 2, 'rec:en'),
]

/* ─── HOME_BUSINESSES ────────────────────────────────────────────────── */

export const HOME_BUSINESSES_RULES: Rule[] = [
  // Productive families / home-business framing
  r(/(?:اسر(?:ة|ه)?\s*منتجه|أسر(?:ة|ه)?\s*منتجه|منتج\s*منزلي|طبخ\s*بيتي|اكل\s*بيتي|من\s*البيت|شغل\s*بيت|صناعه\s*منزليه|صناعة\s*منزلية|اسوي|نسوي|نجهز)/i, 3, 'hb:home'),
  // Meal / catering language
  r(/(?:طلبات|حجز\s*من\s*الليل|متوفر\s*اليوم|فطور|عشاء|غداء|بوفيه|سندوتشات|ساندويتش|كاترينج|كيترنج)/i, 2, 'hb:meal'),
  // Iconic dishes — explicit list so they're weighted higher than the
  // generic MARKETPLACE "للبيع" if both appear (sale of ورق عنب is home
  // business, not classifieds).
  r(/(?:ورق\s*عنب|محشي|كبه|كبة|سمبوسه|سمبوسة|مندي|مضغوط|كبسه|كبسة|منسف|مكبوس|بشاميل|مكرونه|مكرونة|فول|تميس|شكشوكه|شكشوكة|معجنات|فطائر|فطير|حواوشي|ممبار|طلي|ذبيحه|ذبيحة)/i, 3, 'hb:dish'),
  // Sweets / drinks / pantry
  r(/(?:حلويات|حلا|كيك|كيكه|كيكة|تارت|كوكيز|معمول|بقلاوه|بقلاوة|كنافه|كنافة|بسبوسه|بسبوسة|قهوه|قهوة|بهارات|مخللات|عسل|سمن|تمر|فته|فتة)/i, 3, 'hb:sweets'),
  // Occasions
  r(/(?:توزيعات|توزيعات\s*مواليد|توزيعات\s*زواج|تصميم\s*هدايا|تغليف|مناسبات\s*منزليه|مناسبات\s*منزلية)/i, 2, 'hb:occasion'),
  // English
  r(/\b(?:homemade|home\s*food|home\s*cook(?:ing|ed)?|home\s*made|home\s*business|catering|pre[-\s]*order)\b/i, 3, 'hb:en'),
  r(/\b(?:cake|cookies|dessert|sweets|baking|baked)\b/i, 2, 'hb:en-bakery'),
]

/* ─── MARKETPLACE ────────────────────────────────────────────────────── */

export const MARKETPLACE_RULES: Rule[] = [
  // Sell verbs / framing
  r(/(?:للبيع|للبيـع|ابيع|أبيع|بيع|عرض|معروض|عرض\s*للبيع|على\s*البيع|حراج|سومه|سومة|كم\s*السوم)/i, 3, 'mk:sell'),
  // Condition / pricing — weak on their own
  r(/(?:نظيف|نظيفه|نظيفة|مستعمل|مستعمله|مستعملة|جديد|جديده|جديدة|شبه\s*جديد|بحاله\s*ممتازه|بحالة\s*ممتازة|بحاله\s*جيده|بحالة\s*جيدة)/i, 1, 'mk:condition'),
  r(/(?:سعر|بسعر|السعر|كم\s*السعر|تفاوض|قابل\s*للتفاوض|قابل\s*للنقاش|سعر\s*نهائي|كاش)/i, 2, 'mk:price'),
  // Logistics
  r(/(?:توصيل|شحن|استلام|تسليم|الموقع|قريب|بعيد)/i, 1, 'mk:logistics'),
  // Specific goods that are NOT home-businesses / NOT real estate
  r(/(?:اثاث|أثاث|سرير|كنبه|كنبة|طاوله|طاولة|مكتب|كرسي|دولاب|مطبخ|غساله|غسالة|ثلاجه|ثلاجة|فرن|مكيف|مكيفات)/i, 2, 'mk:furniture'),
  r(/(?:جوال|آيفون|ايفون|سامسونج|لابتوب|كمبيوتر|شاشه|شاشة|تابلت|سماعه|سماعة|شاحن|تلفزيون|تلفاز|طابعه|طابعة|ماكينه|ماكينة)/i, 2, 'mk:electronics'),
  r(/(?:قطع\s*غيار|كفرات|بطاريه|بطارية|زيوت|اكسسوارات|سياره|سيارة)/i, 2, 'mk:auto'),
  r(/(?:ملابس|شنطه|شنطة|جزمه|جزمة|حذاء|عبايه|عباية|فستان|نظارات|ساعات|عطر|عطور|كتب|الالعاب|العاب|لعبه|لعبة)/i, 2, 'mk:apparel'),
  // Generic BUY framing
  r(/(?:ابغى\s*اشتري|أبغى\s*اشتري|ابي\s*اشتري|طلب\s*شراء|شراء|اشتري|أشتري|مين\s*يبيع|احد\s*يبيع|عندكم\s*للبيع)/i, 3, 'mk:buy'),
  // English
  r(/\b(?:for\s*sale|selling|sell|buy|buying|second[\s-]*hand|used)\b/i, 3, 'mk:en-sell'),
  r(/\b(?:phone|iphone|samsung|laptop|tv|chair|table|fridge|sofa|bed|furniture)\b/i, 2, 'mk:en-goods'),
  r(/\b(?:price|negotiable|sar)\b/i, 2, 'mk:en-price'),
]

/* ─── JOB (sub-signal under MARKETPLACE) ─────────────────────────────── */

export const JOB_RULES: Rule[] = [
  // Hiring / employer side
  r(/(?:فرصه\s*عمل|فرصة\s*عمل|وظيفه|وظيفة|وظائف|شاغر|شاغره|شاغرة|مطلوب\s*موظف|مطلوب\s*موظفه|مطلوب\s*موظفة|مطلوب\s*موظفين|مطلوب\s*عامل|مطلوب\s*عمال|مطلوب\s*عمال[ةه]|مطلوب\s*سايق|مطلوب\s*سواق|مطلوب\s*محاسب|توظيف|تعيين|تقديم)/i, 3, 'job:hire'),
  r(/(?:راتب|الراتب|دوام|دوام\s*كامل|دوام\s*جزئي|دوام\s*صباحي|دوام\s*مسائي|شفت|شفتات|عقد|عقد\s*عمل|مقابله|مقابلة|موسم|موسمي|موسم\s*الحج|تصريح\s*عمل)/i, 3, 'job:terms'),
  r(/(?:سيره\s*ذاتيه|سيرة\s*ذاتية|cv|سي\s*في|ارسال\s*السيره|ارسال\s*السيرة|للتقديم|رابط\s*التقديم|الخبره|الخبرة|الجنسيات\s*المطلوبه|الجنسيات\s*المطلوبة)/i, 3, 'job:cv'),
  // Seeker side (paired with REQUEST markers elsewhere → JOB request)
  r(/(?:احتاج\s*شغل|أحتاج\s*شغل|ابي\s*شغل|أبغى\s*وظيفه|أبغى\s*وظيفة|ابغى\s*وظيفه|تعرفون\s*شغل|تعرفون\s*وظيفه|عن\s*شغل\s*في\s*الحج|في\s*شغل\s*للحج)/i, 3, 'job:seeker'),
  // English
  r(/\b(?:job|jobs|hiring|hire|employment|vacancy|position|career|salary|shift|recruit(?:ing|ment)?|seasonal|temporary|apply|work\s*opportunity)\b/i, 3, 'job:en'),
  r(/\b(?:full[-\s]*time|part[-\s]*time|contract|cv|resume)\b/i, 3, 'job:en-terms'),
]

/* ─── SERVICES ───────────────────────────────────────────────────────── */

export const SERVICES_RULES: Rule[] = [
  // Trades (formal + colloquial spellings)
  r(/(?:سباك|سباكه|سباكة|كهربائي|كهربجي|كهرباء|نجار|نجاره|نجارة|دهان|دهانات|بويه|بويات|حداد|حداده|حدادة|بلاط|سيراميك|بناء|بنّاء|بناي|لحام|فني|فني\s*تكييف|ميكانيكي|ميكانيكا|تكييف|مكيف|مكيفات)/i, 3, 'sv:trade'),
  // Maintenance / install
  r(/(?:صيانه|صيانة|اصلاح|إصلاح|تركيب|فك\s*و\s*تركيب|نقل\s*و\s*تركيب|تنظيف\s*مكيفات|غسيل\s*مكيفات)/i, 3, 'sv:maintain'),
  // Cleaning / domestic help
  r(/(?:تنظيف|نظافه|نظافة|عامله|عاملة|عاملات|عاملات\s*بالساعه|عاملات\s*بالساعة|خادمه|خادمة|شغاله|شغالة|شركه\s*تنظيف|شركة\s*تنظيف|مكافحه\s*حشرات|مكافحة\s*حشرات)/i, 3, 'sv:clean'),
  // Driving / school transport / errands as a recurring service
  r(/(?:سواق|سايق|مندوب|توصيل\s*مدارس|نقل\s*عفش|سطحه|سطحة|دباب|توصيل\s*شهري|اشتراك\s*شهري)/i, 2, 'sv:driving'),
  // Auto service shops
  r(/(?:بنشر|كفرات|بطاريه|بطارية|غسيل\s*سيارات|مغسله\s*سيارات|مغسلة\s*سيارات|مغسله\s*متنقله|مغسلة\s*متنقلة|تلميع)/i, 2, 'sv:auto'),
  // Personal care
  r(/(?:حلاق|كوافير|صالون|مشغل|مكياج|نقش|حناء|عنايه|عناية\s*بالبشره|عناية\s*بالبشرة|تجميل)/i, 3, 'sv:care'),
  // Tutoring / teaching (formal + colloquial)
  r(/(?:مدرس|مدرّس|مدرسه|مدرّسه|معلم|معلّم|معلمه|معلّمه|خصوصي|دروس|شرح|تعليم|تأسيس|تاسيس|تحفيظ|قرآن|قران|انجليزي|إنجليزي|رياضيات|محفظ|محفظه|محفظة)/i, 3, 'sv:teach'),
  // Childcare
  r(/(?:حضانه|حضانة|روضه|روضة|مربيه|مربية|جليسه|جليسة)/i, 3, 'sv:child'),
  // Media / digital / govt
  r(/(?:تصوير|مصور|فيديو|مونتاج|برمجه|برمجة|تصميم|موقع|تطبيق|سوشال\s*ميديا|طباعه|طباعة|تصوير\s*اوراق|خدمات\s*الكترونيه|خدمات\s*إلكترونية|تعقيب|عقود|رخص|اصدار\s*رخص|إصدار\s*رخص|تقديم\s*جامعات|تقديم\s*وظائف|فيز|زياره\s*عائليه|زيارة\s*عائلية|محامي|محاسبه|محاسبة|ضريبه|ضريبة|زكاه|زكاة)/i, 3, 'sv:digital'),
  // Health / wellness
  r(/(?:حجامه|حجامة|مساج|علاج\s*طبيعي|رد\s*اعصاب)/i, 2, 'sv:health'),
  // Tailoring
  r(/(?:خياطه|خياطة|خياط|تفصيل)/i, 3, 'sv:tailor'),
  // Service framing
  r(/(?:طلب\s*خدمه|طلب\s*خدمة|عرض\s*خدمه|عرض\s*خدمة|نوفر|اوفر|أوفر|نعمل|تواصلوا\s*للطلب)/i, 1, 'sv:framing'),
  // Generic word (weak — appears in OFFER too)
  r(/(?:خدمه|خدمة|خدمات|توفر)/i, 1, 'sv:generic'),
  // English
  r(/\b(?:plumber|plumbing|electrician|electrical|carpenter|painter|cleaning|cleaner|maintenance|repair|handyman|technician|installation|tutor|teacher|driver|school\s*transport|maid|house\s*cleaner|car\s*wash|mechanic|locksmith|laundry|tailoring|salon|barber|typing|printing|government\s*services|documents)\b/i, 3, 'sv:en'),
]

/* ─── LOST_FOUND ─────────────────────────────────────────────────────── */

export const LOST_FOUND_RULES: Rule[] = [
  // LOST side
  r(/(?:ضاع|ضاعت|ضايع|ضايعه|ضايعة|فقدت|مفقود|مفقوده|مفقودة|اختفى|اختفت|انسرق|مسروق|سرقه|سرقة)/i, 3, 'lf:lost'),
  // FOUND side
  r(/(?:لقيت|حصلت|وجدت|عثرت|عثرنا|تم\s*العثور|موجود\s*عندي|لقينا|حصلنا|لقيان)/i, 3, 'lf:found'),
  // Common items / animals (low weight — many also appear elsewhere)
  r(/(?:محفظه|محفظة|جوال\s*ضايع|مفتاح|مفاتيح|بطاقه|بطاقة|هويه|هوية|اقامه|إقامة|شنطه|شنطة|حقيبه|حقيبة|قط|قطه|قطة|كلب|طير|ببغاء|ارنب|أرنب|طفل\s*ضايع|لوح\s*سياره|لوحه\s*سياره|لوحة\s*سيارة)/i, 1, 'lf:item'),
  // English
  r(/\b(?:lost|found|missing)\b/i, 3, 'lf:en'),
  r(/\b(?:wallet|keys?|phone|id\s*card|passport|cat|dog|bird)\b/i, 1, 'lf:en-item'),
]

/* ─── NEIGHBORHOOD_REPORTS — top level ───────────────────────────────── */

export const NEIGHBORHOOD_REPORTS_RULES: Rule[] = [
  // Generic alert / complaint framing
  r(/(?:بلاغ|مشكله|مشكلة|ملاحظه|ملاحظة|اقتراح|شكوى|خطر|خطير|سلامه|سلامة|ضرر|تضرر|مزعج|معاناه|معاناة)/i, 3, 'nr:alert'),
  // Theft / suspicious
  r(/(?:سرقه|سرقة|حرامي|محاوله\s*سرقه|محاولة\s*سرقة|مشتبه|مشبوه|اعتداء)/i, 3, 'nr:theft'),
  // Traffic events (full classifier — subtype detection is separate)
  r(/(?:حادث|حوادث|تصادم|انقلاب|طريق\s*مغلق|شارع\s*مغلق|اغلاق|زحمه|زحمة|ازدحام)/i, 3, 'nr:traffic'),
  // Utilities outages
  r(/(?:انقطاع|انقطعت|عطل|خراب|كهرباء\s*طافيه|كهرباء\s*طافية|مويه\s*مقطوعه|مويه\s*مقطوعة|شبكه\s*ضعيفه|شبكة\s*ضعيفة|اناره|إنارة)/i, 3, 'nr:outage'),
  // Construction / noise / road damage
  r(/(?:حفريات|اعمال|أعمال|ازعاج|إزعاج|ضوضاء|حفره|حفرة|حفر|مطب|مطبات|كسر|اسفلت|سفلته|زفلته|رصف|صبات)/i, 2, 'nr:construct'),
  // Animal hazards
  r(/(?:كلب\s*ضال|حيوان\s*خطير|قطط\s*مريضه|قطط\s*مريضة|كلاب\s*سايبه|كلاب\s*سايبة|قطط\s*سايبه|قطط\s*سايبة)/i, 3, 'nr:animal'),
  // Sanitation
  r(/(?:نفايات|وسخ|رائحه|رائحة|روائح|ريحه|ريحة|صرف\s*صحي|سيول|سيل|تصريف|سطح\s*راكد|مياه\s*راكده|مياه\s*راكدة|غرق|تسرب|وايت\s*صرف)/i, 2, 'nr:sanit'),
  // Authority routes (signals a real report intent)
  r(/(?:بلديه|بلدية|امانه|أمانة|تبليغ|اتصلت\s*الشرطه|اتصلت\s*الشرطة|الشرطه|الشرطة|الدفاع\s*المدني|شكوى|رفع\s*شكوى|منشن|تويتر|اكس|حمله|حملة|مطالبه|مطالبة|نطالب|بلدي|منصه\s*بلدي|منصة\s*بلدي|وزاره\s*النقل|وزارة\s*النقل|جهه\s*مختصه|جهة\s*مختصة)/i, 2, 'nr:authority'),
  // Child safety
  r(/(?:اطفال\s*ضايعين|أطفال\s*ضايعين|خطر\s*على\s*الاطفال|خطر\s*على\s*الأطفال)/i, 3, 'nr:child-safe'),
  // Fire / emergency
  r(/(?:دخان|حريق|نار|طوارئ|انفجار)/i, 3, 'nr:fire'),
  // Urban improvement / civic proposal framing (overlaps PROPOSAL subtype)
  r(/(?:ممشى|ممشاه|ممشاة|يوتيرن|يو\s*تيرن|تطوير|تحسين|تشجير|اشجار|أشجار|تجميل\s*الحي|انسنه|أنسنة|جوده\s*الحياه|جودة\s*الحياة|الحي\s*يحتاج|نحتاج\s*ممشى|نحتاج\s*مطبات|نحتاج\s*مستوصف|نحتاج\s*عياده|نحتاج\s*عيادة)/i, 3, 'nr:civic'),
  r(/(?:مستوصف|مركز\s*صحي|عياده|عيادة\s*مفقوده|عيادة\s*مفقودة|نقص\s*خدمات)/i, 3, 'nr:public-svc'),
  r(/(?:اناره\s*مفقوده|إنارة\s*مفقودة|رصيف|ارصفه|أرصفة|نقل\s*عام|محطه\s*باص|محطة\s*باص)/i, 2, 'nr:infra'),
  // English
  r(/\b(?:outage|leak|fire|smoke|smell|hazard|warning|danger|suspicious|theft|broken|pothole|road\s*closed|power\s*cut|water\s*cut)\b/i, 3, 'nr:en'),
]

/* ─── NEIGHBORHOOD_REPORTS — civicType subtypes ──────────────────────── */

// Each civic-subtype dictionary is split into multiple narrow rules so
// a multi-signal post (e.g., "اليوتيرن خطر متهورة سرعة") can stack
// distinct matches and clear the MIN_SCORE_FOR_SUBTYPE gate. A single
// big alternation regex returns boolean — multiple keywords in the
// same post would only score once.

export const CIVIC_TRAFFIC_SAFETY_RULES: Rule[] = [
  r(/(?:يوتيرن|يو\s*تيرن|دوران\s*خطر|تقاطع|اشاره|إشارة)/i, 3, 'civic:ts-junction'),
  r(/(?:مطب|مطبات)/i, 3, 'civic:ts-bumps'),
  r(/(?:زحمه|زحمة|ازدحام)/i, 2, 'civic:ts-jam'),
  r(/(?:حادث|حوادث|تصادم|انقلاب|دهس)/i, 3, 'civic:ts-accident'),
  r(/(?:عكس\s*السير|عكس\s*الاتجاه)/i, 4, 'civic:ts-wrong-way'),
  r(/(?:سرعه|سرعة|متهور|متهورين)/i, 2, 'civic:ts-speed'),
  r(/(?:مرور|ساهر|طريق\s*خطر)/i, 2, 'civic:ts-traffic'),
  r(/(?:امام|أمام)\s*المدرسه|(?:امام|أمام)\s*المدرسة/i, 2, 'civic:ts-school'),
]

export const CIVIC_INFRASTRUCTURE_RULES: Rule[] = [
  r(/(?:حفره|حفرة|حفر)/i, 3, 'civic:infra-pothole'),
  r(/(?:سفلته|سفلتة|زفلته|زفلتة|رصف|صبات)/i, 3, 'civic:infra-asphalt'),
  r(/(?:رصيف|ارصفه|أرصفة)/i, 3, 'civic:infra-sidewalk'),
  r(/(?:كبري|كوبري|نفق|مدخل\s*ومخرج)/i, 2, 'civic:infra-bridge'),
  r(/(?:تصريف|سيول|امطار|أمطار|غرق|سيل)/i, 3, 'civic:infra-flooding'),
  r(/(?:اناره|إنارة|لمبات|كهرباء\s*شارع|انارة\s*مفقوده|انارة\s*معطله|إنارة\s*معطلة)/i, 5, 'civic:infra-light'),
  r(/(?:شارع|شوارع|طريق)/i, 1, 'civic:infra-street'),
  r(/(?:مواقف\s*سيارات)/i, 2, 'civic:infra-parking'),
]

export const CIVIC_PUBLIC_SERVICES_RULES: Rule[] = [
  // مستوصف / موقف باص are distinctive enough that ONE keyword clears
  // the MIN_SCORE_FOR_SUBTYPE floor on its own. Health and transit are
  // weight 5; the rest stay lower so they need a partner signal.
  r(/(?:مستوصف|مركز\s*صحي|عياده|عيادة|مستشفى)/i, 5, 'civic:public-health'),
  r(/(?:نقل\s*عام|حافلات|باصات|موقف\s*باص)/i, 5, 'civic:public-transport'),
  r(/(?:مدرسه|مدرسة|روضه|روضة|حضانه|حضانة)/i, 2, 'civic:public-edu'),
  r(/(?:حديقه|حديقة|حدائق|ممشى|ممشاه|ممشاة|العاب\s*اطفال|ألعاب\s*أطفال)/i, 3, 'civic:public-park'),
  r(/(?:بلديه|بلدية|امانه|أمانة|مرور)/i, 2, 'civic:public-authority'),
  r(/(?:خدمات\s*عامه|خدمات\s*عامة|مرافق|نقص\s*خدمات)/i, 3, 'civic:public-generic'),
]

export const CIVIC_ENVIRONMENT_RULES: Rule[] = [
  r(/(?:نفايات|زباله|زبالة|حاويه|حاوية|برميل|مخلفات|ردم)/i, 3, 'civic:env-waste'),
  r(/(?:تشوه\s*بصري|رائحه|رائحة|روائح|ريحه|ريحة|دخان|تلوث)/i, 2, 'civic:env-pollution'),
  r(/(?:قوارض|فئران|ناموس|ذباب)/i, 3, 'civic:env-pests'),
  r(/(?:كلاب\s*سايبه|كلاب\s*سايبة|قطط\s*سايبه|قطط\s*سايبة|كلاب\s*ضاله|كلاب\s*ضالة)/i, 4, 'civic:env-strays'),
  r(/(?:طعام\s*مرمي|بقايا\s*طعام)/i, 2, 'civic:env-food-litter'),
  r(/(?:تشجير|شجر|اشجار|أشجار)/i, 3, 'civic:env-trees'),
  r(/(?:نظافه|نظافة)/i, 2, 'civic:env-cleanliness'),
]

export const CIVIC_PROPOSAL_RULES: Rule[] = [
  // The user's active "we propose / we demand" framing is decisive —
  // when they say "نطالب" / "نقترح" the post IS a proposal, even if
  // the body lists infrastructure nouns. Weighted higher than the
  // topical buckets so PROPOSAL beats INFRASTRUCTURE outright on
  // "نطالب بتطوير الأرصفة والإنارة".
  r(/(?:اقترح|اقتراح|نقترح)/i, 4, 'civic:prop-suggest'),
  r(/(?:نطالب|مطالبه|مطالبة)/i, 4, 'civic:prop-demand'),
  r(/(?:فكره|فكرة)/i, 2, 'civic:prop-idea'),
  r(/(?:نحتاج|الحي\s*يحتاج|نتمنى|المفروض|ليش\s*ما|لازم\s*يكون)/i, 3, 'civic:prop-need'),
  r(/(?:حمله|حملة|مباده|مبادرة|فريق\s*تطوعي|فعاليه\s*تطوعيه|فعالية\s*تطوعية)/i, 3, 'civic:prop-campaign'),
  r(/(?:تطوير|تحسين|انسنه|أنسنة|جوده\s*الحياه|جودة\s*الحياة|تجميل\s*الحي)/i, 2, 'civic:prop-improve'),
]

export const CIVIC_COMPLAINT_RULES: Rule[] = [
  r(/(?:شكوى|اشتكي|اشكو)/i, 3, 'civic:complaint-formal'),
  r(/(?:متضرر|تضررنا|معاناه|معاناة)/i, 3, 'civic:complaint-suffering'),
  r(/(?:مزعج|سيء|سيئ)/i, 1, 'civic:complaint-bad'),
  r(/(?:مشكله\s*مستمره|مشكلة\s*مستمرة|لا\s*يوجد\s*تجاوب|تم\s*الرفع|قفلوا\s*الموضوع|بلاغ\s*مرفوض)/i, 3, 'civic:complaint-ongoing'),
]

/* ─── REAL_ESTATE ────────────────────────────────────────────────────── */

export const REAL_ESTATE_RULES: Rule[] = [
  // Property nouns
  r(/(?:شقه|شقة|شقق|فيلا|فلل|فلّه|فله|دور|ملحق|غرفه|غرفة|غرف|ارض|أرض|اراضي|أراضي|عماره|عمارة|بيت|منزل|مستودع|مستودعات|مكتب|مكاتب|معرض|عقار|عقارات)/i, 3, 're:property'),
  // "محل" / "محلات" — DEFERRED to disambiguation. Don't score here.
  // The محل-as-shop guard runs in classifyMetadata; we add a soft +2
  // only when paired with a rent/sale modifier (see RE_COMMERCIAL).
  // Rent / sale modifiers — strong because they're rarely ambiguous
  r(/(?:ايجار|إيجار|للايجار|للإيجار|اجار|أجار|للبيع|تمليك|تملك|للتمليك|بيع\s*عقار|بيع\s*ارض|بيع\s*أرض)/i, 3, 're:tenure'),
  // Lease / legal
  r(/(?:عقد|عقد\s*ايجار|عقد\s*إيجار|سنوي|شهري|دفعه|دفعة|تامين|تأمين|سعر\s*الايجار|سعر\s*الإيجار|صك)/i, 2, 're:lease'),
  // Layout / amenities
  r(/(?:غرفتين|ثلاث\s*غرف|اربع\s*غرف|أربع\s*غرف|صاله|صالة|مطبخ|حمام|مفروش|غير\s*مفروش|مدخل|سطح|حوش|موقف|مواقف|مساحه|مساحة|متر|واجهه|واجهة|زاويه|زاوية|تجاري|سكني|عوائل|عزاب|عمال)/i, 2, 're:layout'),
  // Roles / metadata
  r(/(?:سمسار|مكتب\s*عقار|متاح|شاغر|جاهز|قريب\s*من|خلف|بجوار)/i, 1, 're:role'),
  // English
  r(/\b(?:apartment|flat|villa|house|room|land|warehouse|office|rent(?:al)?|for\s*rent|for\s*sale|wanted|furnished|unfurnished|real\s*estate|property|land\s*for\s*sale)\b/i, 3, 're:en'),
]

/** Strong COMMERCIAL_SHOP signal — only fires when محل is paired with a
 *  rent/sale or commercial-storefront modifier. Without this guard the
 *  word "محل" matches a store-recommendation question ("وين محل نظارات")
 *  and falsely promotes the post to REAL_ESTATE.
 *  Apply this AFTER REAL_ESTATE has already won by other signals OR as
 *  a contributory +2 when it does fire. */
export const REAL_ESTATE_COMMERCIAL_SHOP_RULES: Rule[] = [
  r(/(?:محل|محلات|معرض)\s*(?:للايجار|للإيجار|للبيع|فاضي|فاضيه|فاضية|على\s*الشارع|تجاري|تجاريه|تجارية|مساحه|مساحة|متر)/i, 3, 'recs:commercial-paired'),
  r(/(?:للايجار|للإيجار|للبيع|فاضي|فاضيه|فاضية|على\s*الشارع|تجاري|تجاريه|تجارية)\s*(?:محل|محلات|معرض)/i, 3, 'recs:commercial-paired'),
]

/* ─── RealEstateType subtype dictionaries ────────────────────────────── */

export const RE_APARTMENT_RULES: Rule[] = [
  // "دور" alone is too generic — matches "دورين" inside villa text
  // ("فيلا دورين للإيجار"). Drop it; standalone "دور" is rarely the
  // canonical name for an apartment in KSA classifieds anyway. "ملحق"
  // stays — it's specifically a separate-entrance unit.
  r(/(?:شقه|شقة|شقق|استوديو|ستوديو|ملحق)/i, 3, 're-sub:apartment'),
  r(/\b(?:apartment|flat|studio)\b/i, 3, 're-sub:apartment-en'),
]
export const RE_VILLA_RULES: Rule[] = [
  r(/(?:فيلا|فلل|فلّه|فله)/i, 3, 're-sub:villa'),
  r(/\b(?:villa|house)\b/i, 3, 're-sub:villa-en'),
]
export const RE_LAND_RULES: Rule[] = [
  r(/(?:ارض|أرض|اراضي|أراضي|قطعه\s*ارض|قطعة\s*أرض|مساحه|مساحة|متر|صك)/i, 3, 're-sub:land'),
  r(/\b(?:land|plot)\b/i, 3, 're-sub:land-en'),
]
export const RE_WAREHOUSE_RULES: Rule[] = [
  r(/(?:مستودع|مستودعات|مخزن)/i, 3, 're-sub:warehouse'),
  r(/\b(?:warehouse|storage)\b/i, 3, 're-sub:warehouse-en'),
]
export const RE_RENT_RULES: Rule[] = [
  r(/(?:ايجار|إيجار|للايجار|للإيجار|اجار|أجار)/i, 3, 're-sub:rent'),
  r(/\b(?:rent(?:al)?|for\s*rent)\b/i, 3, 're-sub:rent-en'),
]
export const RE_SALE_RULES: Rule[] = [
  r(/(?:للبيع|بيع|تمليك|تملك|للتمليك)/i, 3, 're-sub:sale'),
  r(/\b(?:for\s*sale|sale)\b/i, 3, 're-sub:sale-en'),
]
export const RE_WANTED_RULES: Rule[] = [
  r(/(?:ابحث\s*عن|أبحث\s*عن|ادور|أدور|ابغى|أبغى|ابي|أبي|محتاج|نحتاج|مطلوب|من\s*يعرف\s*شقه|من\s*يعرف\s*شقة)/i, 3, 're-sub:wanted'),
  r(/\b(?:looking\s*for|wanted|need)\b/i, 3, 're-sub:wanted-en'),
]

/* ─── EVENTS ─────────────────────────────────────────────────────────── */

export const EVENTS_RULES: Rule[] = [
  r(/(?:فعاليه|فعالية|فعاليات|مناسبه|مناسبة|اجتماع|لقاء|تجمع|ماراثون|مشي|حمله|حملة|مبادره|مبادرة|تطوع|فريق\s*تطوعي|تشجير|بازار|معرض|دوره|دورة|ورشه|ورشة|تدريب|محاضره|محاضرة|ندوه|ندوة)/i, 3, 'ev:event'),
  r(/(?:تحفيظ|حلقه|حلقة|درس|دروس\s*دينيه|دروس\s*دينية|افطار\s*جماعي|إفطار\s*جماعي|تروايح|تراويح|عيد|رمضان|اليوم\s*الوطني)/i, 3, 'ev:religious'),
  r(/(?:الدعوه\s*عامه|الدعوة\s*عامة|للاهالي|للأهالي|للنساء|للرجال|للاطفال|للأطفال|للاولاد|للأولاد|للبنات|شهاده|شهادة|مجانيه|مجانية|رسوم|التسجيل|رابط\s*التسجيل|الموقع|العنوان)/i, 2, 'ev:framing'),
  r(/\b(?:event|meetup|meeting|gathering|walk|activity|workshop|course|training|opening|registration|seminar|festival)\b/i, 3, 'ev:en'),
]

/* ─── RIDES / DELIVERY guard ─────────────────────────────────────────── */

export const RIDES_RULES: Rule[] = [
  r(/(?:مشوار|مشاوير|توصيله|توصيلة|يوصلني|يوديني|يجيبني|رايح|جاي|احد\s*رايح|أحد\s*رايح|مين\s*رايح|من\s*يبي\s*يوصل)/i, 3, 'rd:ride'),
  r(/(?:توصيل\s*غرض|اوصل\s*غرض|أوصل\s*غرض|رساله|رسالة|غرض|اغراض|أغراض|صندوق|علبه|علبة|شحنه|شحنة)/i, 3, 'rd:delivery-item'),
  r(/(?:من\s*\S+\s*الى|الى\s*\S+|من\s*الزايدي|من\s*مكه|من\s*مكة|من\s*جده|من\s*جدة|الى\s*الدمام|الى\s*الطايف|الى\s*الطائف|الى\s*الحرم|الى\s*المدرسه|الى\s*المدرسة)/i, 1, 'rd:route'),
  r(/\b(?:ride|lift|carpool|drop\s*off|pick\s*up)\b/i, 3, 'rd:en'),
]

/* ─── COMPETITIONS ───────────────────────────────────────────────────── */

export const COMPETITIONS_RULES: Rule[] = [
  r(/(?:مسابقه|مسابقة|مسابقات|جايزه|جائزة|جوايز|جوائز|سحب|فائز|فايز|فائزين|فايزين|تحدي|شارك\s*و\s*اربح|اربح|كود\s*خصم|كوبون)/i, 3, 'co:contest'),
  r(/\b(?:giveaway|contest|prize|winner)\b/i, 3, 'co:en'),
]

/* ─── Helper: score rules against normalized text ───────────────────── */

export interface ScoreOutcome { score: number; signals: string[] }

export function scoreRules(normalized: string, rules: Rule[]): ScoreOutcome {
  let score = 0
  const signals: string[] = []
  for (const r of rules) {
    if (r.pattern.test(normalized)) {
      score += r.weight
      if (r.signal) signals.push(r.signal)
    }
  }
  return { score, signals }
}

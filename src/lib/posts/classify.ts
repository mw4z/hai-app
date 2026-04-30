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

import type { PostCategory, PostIntent, MarketplaceType } from '@prisma/client'

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
  // Arabic
  { pattern: /(?:طبخ|طبخة|أكلات|اكلات|مأكولات|ماكولات|أكل|اكل|وجبات|وجبة)/i, weight: 3 },
  { pattern: /(?:حلويات|حلى|كيك|بسبوسة|كنافة|كنافه|معمول|تمر|قهوة|شاي|عصير)/i, weight: 3 },
  { pattern: /(?:أسرة منتجة|اسرة منتجة|بيتي|منزلي|صناعة منزلية)/i, weight: 3 },
  { pattern: /(?:كاترينج|كيترنج|بوفيه|توصيل أكل|توصيل اكل)/i, weight: 3 },
  { pattern: /(?:منسف|كبسة|مندي|مكبوس|إفطار|افطار|سحور|عشاء)/i, weight: 2 },
  // English
  { pattern: /(?:home\s*food|home\s*cook(?:ing|ed)?|home\s*made|homemade)/i, weight: 3 },
  { pattern: /(?:catering|dessert|cake|cakes|coffee|tea|juice|baking|baked)/i, weight: 2 },
  { pattern: /(?:meal|meals|breakfast|lunch|dinner|iftar|suhoor)/i, weight: 2 },
]

const MARKETPLACE_RULES: Rule[] = [
  // Selling — Arabic
  { pattern: /(?:للبيع|للبيـع|أبيع|ابيع|بيع|عرض\s*للبيع|على\s*البيع)/i, weight: 3 },
  { pattern: /(?:نظيف|مستعمل|جديد|بحالة\s*ممتازة|بحالة\s*جيدة)/i, weight: 1 },
  { pattern: /(?:سعر|بسعر|السعر|قابل\s*للتفاوض|قابل\s*للنقاش)/i, weight: 2 },
  // Items
  { pattern: /(?:جوال|آيفون|ايفون|سامسونج|لابتوب|تلفزيون|تلفاز|طاولة|كرسي|أثاث|اثاث|ثلاجة|مكيف|غسالة|فرن|سرير|دولاب)/i, weight: 2 },
  // Buying — Arabic
  { pattern: /(?:أبغى|ابغى|أبي|ابي|محتاج|أدور|ادور|أبحث\s*عن|ابحث\s*عن|عند\s*أحد)/i, weight: 1 },
  // English
  { pattern: /(?:for\s*sale|selling|sell|buy|buying|second\s*hand|used)/i, weight: 3 },
  { pattern: /(?:phone|iphone|samsung|laptop|tv|chair|table|fridge|sofa|bed|furniture)/i, weight: 2 },
  { pattern: /(?:price|negotiable|sar|ريال)/i, weight: 2 },
]

const JOB_RULES: Rule[] = [
  // Arabic — employer posting
  { pattern: /(?:فرصة\s*عمل|وظيفة|وظائف|مطلوب\s*موظف|مطلوب\s*موظفة|مطلوب\s*عامل|مطلوب\s*عمالة|مطلوب\s*سائق|مطلوب\s*محاسب)/i, weight: 3 },
  { pattern: /(?:توظيف|تعيين|راتب|الراتب|دوام|دوام\s*كامل|دوام\s*جزئي|دوام\s*صباحي|دوام\s*مسائي)/i, weight: 3 },
  { pattern: /(?:شفت|شفتات|عقد\s*عمل|سيرة\s*ذاتية|cv|سي\s*في)/i, weight: 3 },
  // English
  { pattern: /(?:job|jobs|hiring|hire|employment|vacancy|position|career|salary|shift|recruit(?:ing|ment)?)/i, weight: 3 },
  { pattern: /(?:full[-\s]*time|part[-\s]*time|contract|cv|resume)/i, weight: 3 },
]

// SERVICES — provider category. Keywords are profession names.
const SERVICES_RULES: Rule[] = [
  { pattern: /(?:سباك|سباكة|كهربائي|كهرباء|نجار|نجارة|دهان|دهانات|حداد|حدادة|بناء|بنّاء|بناي)/i, weight: 3 },
  { pattern: /(?:تنظيف|نظافة|عاملة\s*منزلية|عامل\s*نظافة|تكييف|صيانة|إصلاح|اصلاح|تركيب)/i, weight: 3 },
  { pattern: /(?:خدمة|خدمات|أقدم\s*خدمة|اقدم\s*خدمة|توفر|أوفر|اوفر)/i, weight: 1 },
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
  { pattern: /(?:offering|available|book\s*now|order\s*now|i\s*provide|i\s*offer)/i, weight: 2 },
]

const LOST_FOUND_RULES: Rule[] = [
  { pattern: /(?:ضاع|ضاعت|فقدت|مفقود|مفقودة|لقيت|وجدت|عثرت\s*على)/i, weight: 3 },
  { pattern: /(?:محفظة|قطة|قط|كلب|مفاتيح|جوال|بطاقة|هوية|اقامة|إقامة)/i, weight: 1 },
  { pattern: /(?:lost|found|missing)/i, weight: 3 },
  { pattern: /(?:wallet|cat|dog|keys|phone|id\s*card|passport)/i, weight: 1 },
]

const EVENTS_RULES: Rule[] = [
  { pattern: /(?:فعالية|فعاليات|حفل|اجتماع|تجمع|دعوة|محاضرة|درس|دورة|ندوة|مهرجان)/i, weight: 3 },
  { pattern: /(?:تراويح|عيد|رمضان|اليوم\s*الوطني|مولد|عقد\s*قران|عرس|تخرج)/i, weight: 3 },
  { pattern: /(?:event|gathering|meeting|celebration|festival|party|seminar|workshop|class|invite)/i, weight: 3 },
]

const NEIGHBORHOOD_REPORTS_RULES: Rule[] = [
  // Note: تسريب (leak) was removed from here — it matched plumbing
  // requests too ("تسريب المطبخ" = kitchen sink leak, a plumber's
  // job). Real outage reports use انقطاع / عطل anyway.
  { pattern: /(?:انقطاع|انقطعت|عطل|خراب|انفجار|حريق|دخان|ريحة|رائحة|روائح|إنارة|انارة)/i, weight: 3 },
  { pattern: /(?:حفرة|مطب|كسر|طريق\s*مغلق|شارع\s*مغلق|تحذير|انتبهوا|انتبهو|مشبوه|سرقة|اعتداء)/i, weight: 3 },
  { pattern: /(?:بلدية|أمانة|امانة|بلاغ|تبليغ|اتصلت|الشرطة|الدفاع\s*المدني)/i, weight: 2 },
  { pattern: /(?:outage|leak|fire|smoke|smell|hazard|warning|danger|suspicious|theft|broken|pothole|road\s*closed|power\s*cut|water\s*cut)/i, weight: 3 },
]

const RIDES_RULES: Rule[] = [
  { pattern: /(?:مشوار|توصيلة|توصيل|راكب|راكبة|سياره|سيارة|مع\s*السائق)/i, weight: 3 },
  { pattern: /(?:ride|lift|carpool|drive|driver)/i, weight: 3 },
]

const REAL_ESTATE_RULES: Rule[] = [
  { pattern: /(?:شقة|فلة|فيلا|دور|عمارة|عقار|إيجار|ايجار|للإيجار|للايجار|تمليك|للبيع\s*أرض|للبيع\s*ارض|أرض\s*للبيع|ارض\s*للبيع)/i, weight: 3 },
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

export function classifyPostCategory(input: ClassifyInput): ClassifyResult {
  const text = `${input.title || ''} \n ${input.body || ''}`
  const scores = computeScores(text)
  const top = topCategory(scores)

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

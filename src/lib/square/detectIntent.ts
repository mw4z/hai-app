/**
 * Square content intent detection. Pure heuristics — no LLM, no network.
 * Runs on every thread/reply submit and returns the soft-nudge code the
 * caller should show (or null = let it through).
 *
 * Two layers:
 *   1) HARD signals — group invite URLs, repeated promo, etc. → block
 *      ('group_invite' code; API rejects, composer warns).
 *   2) SOFT signals — looks like a service request / lost-found /
 *      marketplace / urgent alert → caller shows a "this might belong
 *      in <section>" nudge but still allows submit.
 *
 * Heuristics are deliberately conservative — false positives are worse
 * than misses for a UX nudge, and the abuse vectors covered here (group
 * spam, repeated phone-number promotion) are the ones we've actually
 * seen on the platform.
 */

export type SquareIntentCode =
  | 'group_invite'   // hard block — WhatsApp/Telegram group invite URL
  | 'repeat_promo'   // hard block — same phone repeated 3+ times (ad)
  | 'service'        // soft — looks like a service request
  | 'lost_found'     // soft — looks like a lost/found item
  | 'marketplace'    // soft — looks like buy/sell
  | 'urgent_alert'   // soft — looks like an urgent neighborhood alert

export interface SquareIntent {
  code: SquareIntentCode
  hard: boolean
  /** Pre-translated Arabic copy, ready to render. EN/UR can be added at
   *  the caller site if needed — the AR is the canonical strings the
   *  user provided in the Square spec. */
  messageAr: string
}

// Group-invite URLs we've seen abused on Saudi neighborhood platforms.
// Conservative — only invite-shaped paths, not arbitrary t.me / wa.me
// links (those are fine for one-off neighbor contact).
const GROUP_INVITE = /(?:chat\.whatsapp\.com\/[A-Za-z0-9]+|t\.me\/(?:joinchat\/|\+)[A-Za-z0-9_-]+)/i

// Saudi-format phone signal: any 9-10 digit run (covers 05xxxxxxxx
// and bare 5xxxxxxxx); used to detect "ad-style" repeated promotion.
const PHONE_RE = /\b0?5\d{8}\b/g

const SERVICE_KEYWORDS = [
  'سبّاك', 'سباك', 'كهربائي', 'فني تكييف', 'نجار', 'دهان', 'سايس',
  'نقل عفش', 'خياط', 'مدرس', 'مدرّس', 'حلاق', 'صيانة', 'ميكانيكي',
  'plumber', 'electrician', 'carpenter', 'painter', 'tutor', 'tailor',
]

const LOST_FOUND_KEYWORDS = [
  'ضايع', 'ضائع', 'فقدت', 'مفقود', 'لقيت', 'وجدت', 'عثرت',
  'lost', 'found', 'missing',
]

const MARKETPLACE_KEYWORDS = [
  'للبيع', 'للايجار', 'للإيجار', 'بسعر', 'ريال فقط', 'مستعمل',
  'for sale', 'for rent', 'selling', 'used',
]

const URGENT_KEYWORDS = [
  'عاجل', 'حادث', 'حريق', 'حرامي', 'سرقة', 'تسرب غاز', 'إصابة',
  'urgent', 'emergency', 'accident', 'fire', 'robbery',
]

/** Returns the most relevant nudge for `text`, or null if nothing to
 *  flag. HARD signals (block) win over SOFT ones; among SOFT signals
 *  the first match wins (categories are roughly orthogonal). */
export function detectSquareIntent(text: string): SquareIntent | null {
  const t = (text || '').trim()
  if (!t) return null

  // ── HARD blocks first ────────────────────────────────────────────
  if (GROUP_INVITE.test(t)) {
    return {
      code: 'group_invite',
      hard: true,
      messageAr:
        'روابط مجموعات واتساب / تليجرام غير مسموح بها في الساحة. لو تبي تشارك خدمة سجّلها في دليل الحي أو قسم الخدمات.',
    }
  }

  // Repeated phone number — same number appearing 3+ times is almost
  // certainly an ad copy, not a discussion.
  const phones = t.match(PHONE_RE) || []
  if (phones.length >= 3) {
    const counts = new Map<string, number>()
    for (const p of phones) counts.set(p, (counts.get(p) || 0) + 1)
    let max = 0
    counts.forEach((v) => { if (v > max) max = v })
    if (max >= 3) {
      return {
        code: 'repeat_promo',
        hard: true,
        messageAr:
          'تكرار رقم الجوال يبدو إعلانًا. إعلانات الخدمات تنشر في دليل الحي أو قسم الخدمات بدل الساحة.',
      }
    }
  }

  // ── SOFT nudges (allowed, with a hint) ───────────────────────────
  const lower = t.toLowerCase()
  const has = (list: string[]) => list.some((k) => lower.includes(k.toLowerCase()))

  if (has(URGENT_KEYWORDS)) {
    return {
      code: 'urgent_alert',
      hard: false,
      messageAr:
        'للتنبيهات المهمة، استخدم مسار البلاغات ليصل للمشرفين بشكل أوضح.',
    }
  }
  if (has(LOST_FOUND_KEYWORDS)) {
    return {
      code: 'lost_found',
      hard: false,
      messageAr:
        'يبدو أن هذا متعلق بالمفقودات. نشره في قسم المفقودات يساعد أهل الحي يشوفونه بوضوح.',
    }
  }
  if (has(MARKETPLACE_KEYWORDS)) {
    return {
      code: 'marketplace',
      hard: false,
      messageAr:
        'يبدو أن هذا إعلان بيع أو شراء. استخدم قسم السوق ليظهر بشكل أوضح.',
    }
  }
  if (has(SERVICE_KEYWORDS)) {
    return {
      code: 'service',
      hard: false,
      messageAr:
        'يبدو أن هذا طلب خدمة. نشره في قسم الخدمات يساعدك تحصل على ردود أفضل.',
    }
  }

  return null
}

/**
 * Best-effort extraction of a service contact from post/comment text.
 * Client-safe (no crypto). Used to offer "إضافة الرقم للدليل" — it only
 * PRE-FILLS the add form; the user always reviews + confirms, and the
 * server re-runs resolve-or-create. Nothing is auto-created here.
 */
import type { ServiceCategory } from '@prisma/client'
import { toE164 } from './phoneFormat'

// Saudi phone shapes inside free text — mobile (intl/local), landline,
// 800, 92xx. Boundaries avoid grabbing digits out of order numbers/years.
const PHONE_RE =
  /(?<![\w+])(?:(?:\+|00)?966[\s-]?5\d(?:[\s-]?\d){7}|0?5\d(?:[\s-]?\d){7}|0?1\d(?:[\s-]?\d){7}|800[\s-]?\d{6,7}|92\d{6,8})(?!\w)/g

export interface PhoneCandidate {
  raw: string    // as it appeared in the text
  e164: string   // normalized
}

/** All distinct, valid Saudi phone candidates in the text (deduped by E.164). */
export function extractPhoneCandidates(text: string): PhoneCandidate[] {
  if (!text) return []
  const out: PhoneCandidate[] = []
  const seen = new Set<string>()
  const re = new RegExp(PHONE_RE)
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const raw = m[0].trim()
    const e164 = toE164(raw)
    if (e164 && !seen.has(e164)) {
      seen.add(e164)
      out.push({ raw, e164 })
    }
  }
  return out
}

// Keyword → service category. First match wins. Intentionally
// conservative: anything not clearly a trade returns null so the form
// forces the user to pick (per spec: uncertain category = manual).
const CATEGORY_KEYWORDS: { cat: ServiceCategory; words: string[] }[] = [
  { cat: 'PLUMBER',     words: ['سباك', 'سبّاك', 'سباكة', 'plumber'] },
  { cat: 'ELECTRICIAN', words: ['كهربائي', 'كهرباء', 'electrician'] },
  { cat: 'AC_TECH',     words: ['تكييف', 'مكيف', 'مكيّف', 'تبريد', 'ac', 'a/c'] },
  { cat: 'CARPENTER',   words: ['نجار', 'نجّار', 'نجارة', 'carpenter'] },
  { cat: 'PAINTER',     words: ['دهان', 'دهّان', 'بويه', 'بوية', 'painter'] },
  { cat: 'CLEANING',    words: ['تنظيف', 'نظافة', 'عمالة', 'cleaning'] },
  { cat: 'MOVING',      words: ['نقل عفش', 'نقل أثاث', 'دينا', 'هاف لوري', 'moving'] },
  { cat: 'TUTOR',       words: ['مدرس', 'مدرّس', 'معلم', 'معلمة', 'تأسيس', 'تدريس', 'tutor'] },
  { cat: 'TAILOR',      words: ['خياط', 'خيّاط', 'خياطة', 'tailor'] },
  { cat: 'HOME_FOOD',   words: ['طبخ', 'مأكولات', 'أسرة منتجة', 'أسر منتجة', 'كيك', 'حلى'] },
  { cat: 'CAR_SERVICE', words: ['بنشر', 'ميكانيكي', 'سطحة', 'كهرباء سيارات', 'غسيل سيارات'] },
  { cat: 'TECH_REPAIR', words: ['صيانة', 'تصليح', 'جوال', 'كمبيوتر', 'لابتوب', 'repair'] },
  { cat: 'HEALTH_HOME', words: ['تمريض', 'ممرض', 'ممرضة', 'علاج طبيعي', 'فيزيو'] },
  { cat: 'BEAUTY',      words: ['مكياج', 'ميك اب', 'كوافير', 'حناء', 'عرايس', 'حمام مغربي', 'مساج', 'تشقير', 'رموش', 'تسريحة', 'مناكير', 'تجميل', 'makeup', 'salon'] },
]

/** Infer a service category from text, or null when uncertain. */
export function inferServiceCategory(text: string): ServiceCategory | null {
  if (!text) return null
  const t = text.toLowerCase()
  for (const { cat, words } of CATEGORY_KEYWORDS) {
    if (words.some((w) => t.includes(w.toLowerCase()))) return cat
  }
  return null
}

/**
 * Best-effort display-name guess from the text around a phone. Looks for
 * a "📱 Name —" snippet, else the short first line if it reads like a
 * name (no phone, ≤ 40 chars). Returns null when nothing confident — the
 * form then leaves the name empty for the user to fill.
 */
export function inferDisplayName(text: string): string | null {
  if (!text) return null
  const tagged = text.match(/📱\s*(.+?)\s*[—–-]\s*(?:\+?\d|0?5)/)
  if (tagged?.[1]) return tagged[1].trim().slice(0, 60)
  const firstLine = text.split(/\r?\n/)[0]?.trim() ?? ''
  if (firstLine && firstLine.length <= 40 && !/\d{6,}/.test(firstLine)) {
    return firstLine.slice(0, 60)
  }
  return null
}

export interface ExtractedContact {
  phones: PhoneCandidate[]
  suggestedName: string | null
  suggestedCategory: ServiceCategory | null
}

export function extractServiceContact(text: string): ExtractedContact {
  return {
    phones: extractPhoneCandidates(text),
    suggestedName: inferDisplayName(text),
    suggestedCategory: inferServiceCategory(text),
  }
}

/** Does the text contain at least one usable Saudi phone? Drives whether
 *  the "add to directory" action is shown at all. */
export function textHasServicePhone(text: string | null | undefined): boolean {
  return !!text && extractPhoneCandidates(text).length > 0
}

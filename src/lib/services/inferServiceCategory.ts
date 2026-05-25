import type { ServiceCategory } from '@prisma/client'

/**
 * Best-effort service-category guess from free text (a provider's service
 * description / bio / name). Arabic + English keyword substring match,
 * first match wins. Falls back to OTHER ('أخرى') when nothing matches — a
 * provider or a mod can correct it via the directory card's edit form.
 */
const KEYWORDS: Array<{ cat: ServiceCategory; words: string[] }> = [
  { cat: 'PLUMBER',     words: ['سباك', 'سبّاك', 'سباكة', 'مواسير', 'تسريب', 'صرف صحي', 'plumb'] },
  { cat: 'ELECTRICIAN', words: ['كهربائي', 'كهرباء', 'تمديدات كهرب', 'electric'] },
  { cat: 'AC_TECH',     words: ['تكييف', 'مكيف', 'مكيفات', 'تبريد', 'سبليت', 'فريون', 'a/c', 'air condition'] },
  { cat: 'CARPENTER',   words: ['نجار', 'نجّار', 'نجارة', 'أبواب خشب', 'carpenter'] },
  { cat: 'PAINTER',     words: ['دهان', 'دهّان', 'بويه', 'بوية', 'صبغ', 'paint'] },
  { cat: 'CLEANING',    words: ['نظافة', 'تنظيف', 'عمالة', 'clean'] },
  { cat: 'MOVING',      words: ['نقل عفش', 'عفش', 'نقل أثاث', 'دينا نقل', 'moving', 'mover'] },
  { cat: 'TUTOR',       words: ['مدرس', 'مدرّس', 'تأسيس', 'تدريس', 'معلم', 'دروس', 'tutor', 'teacher'] },
  { cat: 'TAILOR',      words: ['خياط', 'خيّاط', 'خياطة', 'تفصيل', 'tailor'] },
  { cat: 'HOME_FOOD',   words: ['طبخ', 'مأكولات', 'طبخات', 'معجنات', 'حلويات', 'أكل بيت', 'home food', 'cook'] },
  { cat: 'CAR_SERVICE', words: ['سيارات', 'سيارة', 'ميكانيكي', 'بنشر', 'كراج', 'ورشة سيار', 'car service', 'auto'] },
  { cat: 'TECH_REPAIR', words: ['صيانة', 'جوال', 'جوالات', 'كمبيوتر', 'أجهزة', 'شاشات', 'repair'] },
  { cat: 'HEALTH_HOME', words: ['تمريض', 'ممرض', 'علاج طبيعي', 'فيزيو', 'خدمات صحية', 'home health', 'nurse'] },
]

export function inferServiceCategory(...texts: Array<string | null | undefined>): ServiceCategory {
  const hay = texts.filter(Boolean).join(' ').toLowerCase()
  if (!hay.trim()) return 'OTHER'
  for (const { cat, words } of KEYWORDS) {
    if (words.some((w) => hay.includes(w.toLowerCase()))) return cat
  }
  return 'OTHER'
}

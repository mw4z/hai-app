import type { ServiceCategory } from '@prisma/client'

/** Display metadata for each ServiceCategory (trade type). Trilingual,
 *  canonical (logical) order — never manually reversed. */
export interface ServiceCategoryMeta {
  key: ServiceCategory
  emoji: string
  labelAr: string
  labelEn: string
  labelUr: string
}

export const SERVICE_CATEGORIES: ServiceCategoryMeta[] = [
  { key: 'PLUMBER',      emoji: '🔧', labelAr: 'سبّاك',            labelEn: 'Plumber',        labelUr: 'پلمبر' },
  { key: 'ELECTRICIAN',  emoji: '💡', labelAr: 'كهربائي',          labelEn: 'Electrician',    labelUr: 'الیکٹریشن' },
  { key: 'AC_TECH',      emoji: '❄️', labelAr: 'فني تكييف',        labelEn: 'AC technician',  labelUr: 'اے سی ٹیکنیشن' },
  { key: 'CARPENTER',    emoji: '🪚', labelAr: 'نجّار',            labelEn: 'Carpenter',      labelUr: 'بڑھئی' },
  { key: 'PAINTER',      emoji: '🖌️', labelAr: 'دهّان',            labelEn: 'Painter',        labelUr: 'پینٹر' },
  { key: 'CLEANING',     emoji: '🧹', labelAr: 'عمالة نظافة',      labelEn: 'Cleaning',       labelUr: 'صفائی' },
  { key: 'MOVING',       emoji: '🚚', labelAr: 'نقل عفش',          labelEn: 'Moving',         labelUr: 'سامان منتقلی' },
  { key: 'TUTOR',        emoji: '📚', labelAr: 'مدرّس / تأسيس',    labelEn: 'Tutor',          labelUr: 'ٹیوٹر' },
  { key: 'TAILOR',       emoji: '🧵', labelAr: 'خيّاط',            labelEn: 'Tailor',         labelUr: 'درزی' },
  { key: 'HOME_FOOD',    emoji: '🍲', labelAr: 'طبخ منزلي',        labelEn: 'Home food',      labelUr: 'گھریلو کھانا' },
  { key: 'CAR_SERVICE',  emoji: '🚗', labelAr: 'خدمة سيارات',      labelEn: 'Car service',    labelUr: 'گاڑی سروس' },
  { key: 'TECH_REPAIR',  emoji: '🛠️', labelAr: 'صيانة أجهزة',      labelEn: 'Device repair',  labelUr: 'آلات مرمت' },
  { key: 'HEALTH_HOME',  emoji: '🩺', labelAr: 'خدمات صحية منزلية', labelEn: 'Home health',   labelUr: 'گھریلو صحت' },
  { key: 'COURIER',      emoji: '🛵', labelAr: 'مندوب',            labelEn: 'Courier',        labelUr: 'ڈلیوری' },
  { key: 'RESTAURANT',   emoji: '🍽️', labelAr: 'مطعم',             labelEn: 'Restaurant',     labelUr: 'ریستوران' },
  { key: 'REAL_ESTATE',  emoji: '🏢', labelAr: 'عقار',             labelEn: 'Real estate',    labelUr: 'پراپرٹی' },
  { key: 'BEAUTY',       emoji: '💄', labelAr: 'تجميل وكوافير',     labelEn: 'Beauty & salon', labelUr: 'بیوٹی' },
  { key: 'MISC_SUPPLIES',emoji: '🛒', labelAr: 'مستلزمات متنوعة',   labelEn: 'Misc supplies',  labelUr: 'متفرق سامان' },
  { key: 'OTHER',        emoji: '🔖', labelAr: 'أخرى',             labelEn: 'Other',          labelUr: 'دیگر' },
]

const BY_KEY = Object.fromEntries(
  SERVICE_CATEGORIES.map((c) => [c.key, c] as const),
) as Record<ServiceCategory, ServiceCategoryMeta>

export const SERVICE_CATEGORY_KEYS = SERVICE_CATEGORIES.map((c) => c.key)

export function getServiceCategoryMeta(key: ServiceCategory): ServiceCategoryMeta {
  return BY_KEY[key] ?? BY_KEY.OTHER
}

export function serviceCategoryLabel(key: ServiceCategory, lang: string): string {
  const m = getServiceCategoryMeta(key)
  return lang === 'en' ? m.labelEn : lang === 'ur' ? m.labelUr : m.labelAr
}

export function isValidServiceCategory(v: unknown): v is ServiceCategory {
  return typeof v === 'string' && (SERVICE_CATEGORY_KEYS as string[]).includes(v)
}

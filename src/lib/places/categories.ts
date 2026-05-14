import type { PlaceCategory } from '@prisma/client'

/** Display metadata for every PlaceCategory enum value. Trilingual
 *  labels stored in canonical (logical) order — never manually
 *  reversed. The emoji is shown next to the category chip on the
 *  directory page and the place card. */
export interface PlaceCategoryMeta {
  key: PlaceCategory
  emoji: string
  labelAr: string
  labelEn: string
  labelUr: string
}

export const PLACE_CATEGORIES: PlaceCategoryMeta[] = [
  { key: 'RESTAURANT_CAFE',     emoji: '🍽️', labelAr: 'مطاعم وكافيهات',   labelEn: 'Restaurants & cafés', labelUr: 'ریستوران اور کیفے' },
  { key: 'PHARMACY',            emoji: '💊', labelAr: 'صيدليات',           labelEn: 'Pharmacies',          labelUr: 'فارمیسیاں' },
  { key: 'SUPERMARKET',         emoji: '🛒', labelAr: 'سوبرماركت وتموينات', labelEn: 'Supermarkets',       labelUr: 'سپر مارکیٹ' },
  { key: 'CAR_WASH',            emoji: '🚗', labelAr: 'مغاسل سيارات',      labelEn: 'Car washes',          labelUr: 'گاڑی دھونے کی جگہ' },
  { key: 'LAUNDRY',             emoji: '🧺', labelAr: 'مغاسل ملابس',       labelEn: 'Laundries',           labelUr: 'دھوبی' },
  { key: 'CLINIC',              emoji: '🏥', labelAr: 'عيادات ومستوصفات',  labelEn: 'Clinics',             labelUr: 'کلینکس' },
  { key: 'SCHOOL_KINDERGARTEN', emoji: '🏫', labelAr: 'مدارس وروضات',      labelEn: 'Schools & kindergartens', labelUr: 'اسکول اور کنڈرگارٹن' },
  { key: 'QURAN_CIRCLE',        emoji: '📖', labelAr: 'تحفيظ قرآن',        labelEn: 'Quran circles',       labelUr: 'تحفیظ قرآن' },
  { key: 'GAS_STATION',         emoji: '⛽', labelAr: 'محطات',              labelEn: 'Gas stations',        labelUr: 'پٹرول پمپ' },
  { key: 'SHOP_SERVICES',       emoji: '🛍️', labelAr: 'محلات وخدمات',     labelEn: 'Shops & services',    labelUr: 'دکانیں اور خدمات' },
  { key: 'GYM_CENTER',          emoji: '🏋️', labelAr: 'نوادي ومراكز',     labelEn: 'Gyms & centers',      labelUr: 'جم اور مراکز' },
  { key: 'SALON',               emoji: '💇', labelAr: 'صالونات',           labelEn: 'Salons',              labelUr: 'سیلون' },
  { key: 'OTHER',               emoji: '📍', labelAr: 'أخرى',              labelEn: 'Other',               labelUr: 'دیگر' },
]

const META_BY_KEY = Object.fromEntries(
  PLACE_CATEGORIES.map((c) => [c.key, c] as const),
) as Record<PlaceCategory, PlaceCategoryMeta>

export function getCategoryMeta(key: PlaceCategory): PlaceCategoryMeta {
  return META_BY_KEY[key] ?? META_BY_KEY.OTHER
}

export function getCategoryLabel(
  key: PlaceCategory,
  lang: 'ar' | 'en' | 'ur',
): string {
  const m = getCategoryMeta(key)
  return lang === 'en' ? m.labelEn : lang === 'ur' ? m.labelUr : m.labelAr
}

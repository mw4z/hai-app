'use client'

/**
 * Phase 1 subtype chip — small read-only pill next to the category
 * badge on a PostCard. Surfaces the classifier's inferred metadata:
 *
 *   REAL_ESTATE.APARTMENT_RENT  → "شقة للإيجار"
 *   NEIGHBORHOOD_REPORTS.TRAFFIC_SAFETY → "مرور وسلامة"
 *   EVENTS with eventStartAt    → "📅 الجمعة 7م"
 *
 * Strings are stored normally (no manual RTL reversal) — direction is
 * handled by the surrounding RTL container. The chip is gated by
 * NEXT_PUBLIC_STRUCTURED_POST_METADATA so flipping the flag off
 * removes it from every rendered post without code changes.
 */

import { useLanguage } from '@/hooks/useLanguage'

export interface SubtypeChipProps {
  category: string
  realEstateType?: string | null
  civicType?: string | null
  eventStartAt?: string | null    // ISO from server JSON
  eventLocation?: string | null
}

const RE_LABELS: Record<string, { ar: string; en: string; ur: string }> = {
  APARTMENT_RENT:  { ar: 'شقة للإيجار',   en: 'Apartment for rent', ur: 'فلیٹ کرائے کیلئے' },
  APARTMENT_SALE:  { ar: 'شقة للبيع',     en: 'Apartment for sale', ur: 'فلیٹ فروخت' },
  VILLA_RENT:      { ar: 'فيلا للإيجار',  en: 'Villa for rent',     ur: 'ولا کرائے کیلئے' },
  VILLA_SALE:      { ar: 'فيلا للبيع',    en: 'Villa for sale',     ur: 'ولا فروخت' },
  LAND_SALE:       { ar: 'أرض للبيع',     en: 'Land for sale',      ur: 'زمین فروخت' },
  COMMERCIAL_SHOP: { ar: 'محل تجاري',     en: 'Commercial shop',    ur: 'تجارتی دکان' },
  WAREHOUSE:       { ar: 'مستودع',        en: 'Warehouse',          ur: 'گودام' },
  WANTED:          { ar: 'مطلوب',         en: 'Wanted',             ur: 'مطلوب' },
}

const CIVIC_LABELS: Record<string, { ar: string; en: string; ur: string }> = {
  TRAFFIC_SAFETY:  { ar: 'مرور وسلامة',  en: 'Traffic & safety',  ur: 'ٹریفک اور حفاظت' },
  INFRASTRUCTURE:  { ar: 'بنية تحتية',    en: 'Infrastructure',    ur: 'انفراسٹرکچر' },
  PUBLIC_SERVICES: { ar: 'خدمات عامة',    en: 'Public services',   ur: 'عوامی خدمات' },
  ENVIRONMENT:     { ar: 'بيئة ونظافة',   en: 'Environment',       ur: 'ماحول و صفائی' },
  PROPOSAL:        { ar: 'اقتراح',        en: 'Proposal',          ur: 'تجویز' },
  COMPLAINT:       { ar: 'شكوى',          en: 'Complaint',         ur: 'شکایت' },
}

function formatEventTime(iso: string, lang: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const locale = lang === 'en' ? 'en-US' : 'ar-SA'
  // "الجمعة 7م" style — short weekday + hour. Keep it compact.
  return d.toLocaleString(locale, {
    weekday: 'short',
    hour: 'numeric',
    minute: d.getMinutes() ? '2-digit' : undefined,
  })
}

export default function SubtypeChip(props: SubtypeChipProps) {
  // Feature flag — gates UI only. Server already stores the data.
  if (process.env.NEXT_PUBLIC_STRUCTURED_POST_METADATA !== '1') return null
  const { lang } = useLanguage()

  let label = ''
  if (props.category === 'REAL_ESTATE' && props.realEstateType && RE_LABELS[props.realEstateType]) {
    const l = RE_LABELS[props.realEstateType]
    label = lang === 'en' ? l.en : lang === 'ur' ? l.ur : l.ar
  } else if (props.category === 'NEIGHBORHOOD_REPORTS' && props.civicType && CIVIC_LABELS[props.civicType]) {
    const l = CIVIC_LABELS[props.civicType]
    label = lang === 'en' ? l.en : lang === 'ur' ? l.ur : l.ar
  } else if (props.category === 'EVENTS' && props.eventStartAt) {
    const time = formatEventTime(props.eventStartAt, lang)
    label = time ? `📅 ${time}` : ''
  }

  if (!label) return null

  return (
    <span
      dir="auto"
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
    >
      {label}
    </span>
  )
}

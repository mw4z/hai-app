'use client'

import Link from 'next/link'
import type { PublicPlace } from '@/lib/places/serialize'
import { useLanguage } from '@/hooks/useLanguage'
import { getCategoryMeta } from '@/lib/places/categories'
import PlaceStatusBadge from './PlaceStatusBadge'
import PlacePill from './PlacePill'

/** Card used in /directory and /directory/mine. Renders the
 *  category emoji + name + short address + status badge with
 *  a "تفاصيل" affordance. Tap the whole card → detail page. */
export default function PlaceCard({ place }: { place: PublicPlace }) {
  const { lang } = useLanguage()
  const cat = getCategoryMeta(place.category)
  const categoryLabel =
    lang === 'en' ? cat.labelEn : lang === 'ur' ? cat.labelUr : cat.labelAr

  return (
    <Link
      href={`/directory/${place.id}`}
      className="block rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3.5 active:scale-[0.99] transition-transform shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none flex-shrink-0" aria-hidden>{cat.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <h3 className="text-[15px] font-bold text-gray-900 dark:text-white leading-tight flex-1 truncate">
              {place.name}
            </h3>
            <PlaceStatusBadge status={place.status} />
          </div>
          <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            {categoryLabel}
            {place.addressText ? ` · ${place.addressText}` : ''}
          </p>
          {/* Live open/closed (or owner override) pill. Hides
              itself when the place has no parseable hours AND
              no manual override. */}
          <div className="mt-1">
            <PlacePill place={place} size="sm" />
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[12px] text-gray-500 dark:text-gray-400">
            {place.phone && <span dir="ltr">📞 {place.phone}</span>}
            {place.whatsapp && <span dir="ltr">💬 {place.whatsapp}</span>}
            <span className="ml-auto rtl:ml-0 rtl:mr-auto text-primary-600 dark:text-primary-400 text-[12px] font-medium">
              {lang === 'en' ? 'View' : lang === 'ur' ? 'دیکھیں' : 'عرض التفاصيل'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

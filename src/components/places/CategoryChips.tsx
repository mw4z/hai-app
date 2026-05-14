'use client'

import type { PlaceCategory } from '@prisma/client'
import { useLanguage } from '@/hooks/useLanguage'
import { PLACE_CATEGORIES } from '@/lib/places/categories'

interface Props {
  selected: PlaceCategory | null
  onSelect: (c: PlaceCategory | null) => void
}

/** Horizontal scrollable chip row for category filtering. The
 *  leading "All" chip clears the filter. */
export default function CategoryChips({ selected, onSelect }: Props) {
  const { lang } = useLanguage()
  const allLabel = lang === 'en' ? 'All' : lang === 'ur' ? 'تمام' : 'الكل'

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
          selected === null
            ? 'bg-primary-600 text-white'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
        }`}
      >
        {allLabel}
      </button>
      {PLACE_CATEGORIES.map((c) => {
        const label = lang === 'en' ? c.labelEn : lang === 'ur' ? c.labelUr : c.labelAr
        const isActive = selected === c.key
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onSelect(c.key)}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              isActive
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
          >
            <span aria-hidden>{c.emoji}</span>
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}

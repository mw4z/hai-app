'use client'

import { useState } from 'react'
import type { PlaceCategory } from '@prisma/client'
import { useLanguage } from '@/hooks/useLanguage'
import { PLACE_CATEGORIES } from '@/lib/places/categories'
import { hapticLight } from '@/lib/haptic'
import CategoryPickerSheet, { type CategoryOption } from '@/components/CategoryPickerSheet'

interface Props {
  selected: PlaceCategory | null
  onSelect: (c: PlaceCategory | null) => void
}

/**
 * Horizontal category chip strip + an always-visible trailing
 * "All categories" pill that opens a bottom-sheet picker.
 *
 * The strip is still horizontally scrollable for users who know to
 * swipe, but the elderly / low-tech segment routinely doesn't
 * realise content lives off-screen — the trailing pill is the
 * explicit, discoverable affordance to surface every category
 * without any swipe gesture at all.
 */
export default function CategoryChips({ selected, onSelect }: Props) {
  const { lang, t } = useLanguage()
  const [pickerOpen, setPickerOpen] = useState(false)

  const allLabel = lang === 'en' ? 'All' : lang === 'ur' ? 'تمام' : 'الكل'

  const labelFor = (c: typeof PLACE_CATEGORIES[number]) =>
    lang === 'en' ? c.labelEn : lang === 'ur' ? c.labelUr : c.labelAr

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Scrollable chip strip. flex-1 + min-w-0 lets the trailing
            pill claim its space without being squeezed off-screen. */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar flex-1 min-w-0">
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
            const label = labelFor(c)
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

        {/* Trailing "All categories" pill. Gradient + emoji so it
            visually parts from the chips and reads as an action,
            not another filter value. Tap → opens the full sheet. */}
        <button
          type="button"
          onClick={() => { hapticLight(); setPickerOpen(true) }}
          className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-primary-500 to-emerald-500 text-white shadow-[0_2px_8px_rgba(16,185,129,0.35)] active:scale-95 transition-transform"
          aria-label={t('categories_browse_all')}
          title={t('categories_browse_all')}
        >
          <span aria-hidden>📂</span>
          <span className="whitespace-nowrap">{t('categories_browse_all')}</span>
        </button>
      </div>

      <CategoryPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selected={selected}
        onSelect={(v) => onSelect(v as PlaceCategory | null)}
        title={t('categories_pick_dir')}
        options={[
          {
            value: null,
            emoji: '🏘️',
            label: allLabel,
          },
          ...PLACE_CATEGORIES.map<CategoryOption>((c) => ({
            value: c.key,
            emoji: c.emoji,
            label: labelFor(c),
          })),
        ]}
      />
    </>
  )
}

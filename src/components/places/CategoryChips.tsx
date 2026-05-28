'use client'

import { useMemo, useState } from 'react'
import { FiChevronDown } from 'react-icons/fi'
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
 * Single dropdown-style trigger that opens a bottom-sheet picker
 * with every category as a vertical row. Replaces the prior
 * horizontally-scrolling chip strip — the chip strip hid options
 * off-screen and required a swipe gesture to discover (which the
 * elderly / low-tech audience routinely misses).
 *
 * The trigger always shows the current filter (emoji + label +
 * chevron) and lights up with the brand colour when a category is
 * active, so the user can tell at a glance whether they've narrowed
 * the directory or not.
 */
export default function CategoryChips({ selected, onSelect }: Props) {
  const { lang, t } = useLanguage()
  const [pickerOpen, setPickerOpen] = useState(false)

  const allLabel = t('categories_browse_all')

  const currentEmoji = useMemo(() => {
    if (!selected) return '🏘️'
    const found = PLACE_CATEGORIES.find((c) => c.key === selected)
    return found?.emoji ?? '📍'
  }, [selected])

  const currentLabel = useMemo(() => {
    if (!selected) return allLabel
    const found = PLACE_CATEGORIES.find((c) => c.key === selected)
    if (!found) return allLabel
    return lang === 'en' ? found.labelEn : lang === 'ur' ? found.labelUr : found.labelAr
  }, [selected, lang, allLabel])

  const isFiltered = selected !== null

  const options = useMemo<CategoryOption[]>(
    () => [
      { value: null, emoji: '🏘️', label: allLabel },
      ...PLACE_CATEGORIES.map<CategoryOption>((c) => ({
        value: c.key,
        emoji: c.emoji,
        label: lang === 'en' ? c.labelEn : lang === 'ur' ? c.labelUr : c.labelAr,
      })),
    ],
    [lang, allLabel],
  )

  return (
    <>
      <button
        type="button"
        onClick={() => { hapticLight(); setPickerOpen(true) }}
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        className={`w-full inline-flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors active:scale-[0.98] ${
          isFiltered
            ? 'bg-primary-50 dark:bg-primary-900/25 border border-primary-300 dark:border-primary-700 text-primary-800 dark:text-primary-200'
            : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white'
        }`}
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className="text-base flex-shrink-0" aria-hidden>{currentEmoji}</span>
          <span className="truncate">{currentLabel}</span>
        </span>
        <FiChevronDown
          className={`w-4 h-4 flex-shrink-0 transition-transform ${
            isFiltered ? 'text-primary-600 dark:text-primary-300' : 'text-gray-400 dark:text-gray-500'
          } ${pickerOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <CategoryPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selected={selected}
        onSelect={(v) => onSelect(v as PlaceCategory | null)}
        title={t('categories_pick_dir')}
        options={options}
      />
    </>
  )
}

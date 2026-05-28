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
        className={`w-full inline-flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-[15px] font-bold transition-colors active:scale-[0.98] shadow-[0_2px_10px_rgba(14,165,233,0.12)] ${
          isFiltered
            ? 'bg-primary-100 dark:bg-primary-900/35 border-2 border-primary-500 dark:border-primary-500 text-primary-900 dark:text-primary-100'
            : 'bg-primary-50 dark:bg-primary-900/20 border-2 border-primary-300 dark:border-primary-700/60 text-gray-900 dark:text-white'
        }`}
      >
        <span className="inline-flex items-center gap-2.5 min-w-0">
          <span className="text-lg flex-shrink-0" aria-hidden>{currentEmoji}</span>
          <span className="truncate">{currentLabel}</span>
        </span>
        <FiChevronDown
          className={`w-5 h-5 flex-shrink-0 text-primary-600 dark:text-primary-300 transition-transform ${
            pickerOpen ? 'rotate-180' : ''
          }`}
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

'use client'

import { useMemo, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import type { GoogleReviewPublic } from '@/lib/places/serialize'
import PlaceSourceBadge from './PlaceSourceBadge'

/**
 * Google reviews block for the place detail page.
 *
 * - Star filter chips (All + each rating present) to narrow the list.
 * - Horizontal scroll of review cards (Google-Maps style) instead of
 *   a tall stacked list.
 * - Long review text collapses to a few lines with a "read more"
 *   toggle per card.
 *
 * Note: Google's Place Details API returns at most 5 reviews, so this
 * never shows more than 5 — that's a hard API ceiling, not a UI cap.
 */

const TRUNCATE = 180

export default function GoogleReviewsSection({ reviews }: { reviews: GoogleReviewPublic[] }) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  const [filter, setFilter] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  // Distinct ratings present, high → low, for the filter chips.
  const ratingsPresent = useMemo(
    () =>
      Array.from(
        new Set(
          reviews
            .map((r) => (r.rating != null ? Math.round(r.rating) : null))
            .filter((x): x is number => x != null),
        ),
      ).sort((a, b) => b - a),
    [reviews],
  )

  if (!reviews || reviews.length === 0) return null

  const shown =
    filter == null
      ? reviews
      : reviews.filter((r) => r.rating != null && Math.round(r.rating) === filter)

  return (
    <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">
          {tr('Reviews on Google', 'تقييمات على Google', 'گوگل پر جائزے')}
        </h2>
        <PlaceSourceBadge source="GOOGLE" size="xs" />
        <span className="text-[11px] text-gray-400">({reviews.length})</span>
      </div>

      {/* Star filter — only when there's more than one rating value. */}
      {ratingsPresent.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <FilterChip
            active={filter == null}
            onClick={() => setFilter(null)}
            label={`${tr('All', 'الكل', 'سب')} (${reviews.length})`}
          />
          {ratingsPresent.map((star) => {
            const count = reviews.filter(
              (r) => r.rating != null && Math.round(r.rating) === star,
            ).length
            return (
              <FilterChip
                key={star}
                active={filter === star}
                onClick={() => setFilter(star)}
                label={`★${star} (${count})`}
              />
            )
          })}
        </div>
      )}

      {/* Horizontal scroll of review cards. */}
      <div className="-mx-4 px-4 overflow-x-auto no-scrollbar">
        <div className="flex gap-3">
          {shown.map((r) => {
            const idx = reviews.indexOf(r)
            const text = r.text ?? ''
            const long = text.length > TRUNCATE
            const isExp = !!expanded[idx]
            const display = long && !isExp ? `${text.slice(0, TRUNCATE).trimEnd()}…` : text
            return (
              <div
                key={idx}
                className="flex-shrink-0 w-[270px] rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12.5px] font-bold text-gray-900 dark:text-white">
                    {r.author || tr('Google user', 'مستخدم Google', 'گوگل صارف')}
                  </span>
                  {r.rating != null && (
                    <span className="text-amber-500 text-[12px]" aria-label={`${r.rating}/5`}>
                      {'★'.repeat(Math.round(r.rating))}
                      <span className="text-gray-300 dark:text-gray-600">
                        {'★'.repeat(5 - Math.round(r.rating))}
                      </span>
                    </span>
                  )}
                </div>
                {r.relativeTime && (
                  <p className="text-[10.5px] text-gray-400 mt-0.5">{r.relativeTime}</p>
                )}
                {text && (
                  <p className="text-[12.5px] text-gray-700 dark:text-gray-300 leading-relaxed mt-1.5 whitespace-pre-line">
                    {display}{' '}
                    {long && (
                      <button
                        type="button"
                        onClick={() => setExpanded((p) => ({ ...p, [idx]: !isExp }))}
                        className="text-primary-600 dark:text-primary-400 font-semibold whitespace-nowrap"
                      >
                        {isExp
                          ? tr('Show less', 'أقل', 'کم')
                          : tr('Read more', 'اقرأ المزيد', 'مزید')}
                      </button>
                    )}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
        active
          ? 'bg-primary-600 text-white'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
      }`}
    >
      {label}
    </button>
  )
}

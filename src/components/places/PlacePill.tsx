'use client'

import { useEffect, useState } from 'react'
import { computePlacePill, type PlaceOpenStateInput, type PillTone } from '@/lib/places/openState'

/**
 * Renders the مفتوح / مغلق / "owner override" pill for a place.
 * Client-only: the wall clock matters for the auto pill, and
 * SSR'd answers go stale every minute. Hides itself entirely
 * when the place has no parseable hours AND no manual override.
 *
 * Re-evaluates every 60s while mounted so a place that just
 * crossed an opening boundary flips from "مغلق" → "مفتوح"
 * without needing a navigation.
 */

const TONE_CLASSES: Record<PillTone, string> = {
  open:           'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/60',
  soon:           'bg-amber-100   dark:bg-amber-900/40   text-amber-800   dark:text-amber-200   border-amber-200   dark:border-amber-800/60',
  closed:         'bg-gray-100    dark:bg-gray-700/40    text-gray-600    dark:text-gray-300    border-gray-200    dark:border-gray-700',
  'manual-warn':  'bg-amber-100   dark:bg-amber-900/40   text-amber-800   dark:text-amber-200   border-amber-200   dark:border-amber-800/60',
  'manual-danger':'bg-rose-100    dark:bg-rose-900/40    text-rose-700    dark:text-rose-200    border-rose-200    dark:border-rose-800/60',
}

const TONE_DOTS: Record<PillTone, string> = {
  open:           'bg-emerald-500',
  soon:           'bg-amber-500',
  closed:         'bg-gray-400',
  'manual-warn':  'bg-amber-500',
  'manual-danger':'bg-rose-500',
}

interface Props {
  place: PlaceOpenStateInput
  /** Visual size — "sm" for list cards, "md" for detail header. */
  size?: 'sm' | 'md'
  className?: string
}

export default function PlacePill({ place, size = 'sm', className = '' }: Props) {
  // Force a re-render every 60s so the auto pill stays accurate
  // when the user lingers on a list / detail page.
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const pill = computePlacePill(place)
  if (!pill) return null

  const sz = size === 'md'
    ? 'text-[12px] px-2.5 py-1'
    : 'text-[10.5px] px-2 py-0.5'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap max-w-[140px] truncate ${TONE_CLASSES[pill.tone]} ${sz} ${className}`}
      title={pill.label}
    >
      <span aria-hidden className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${TONE_DOTS[pill.tone]}`} />
      <span className="truncate">{pill.label}</span>
    </span>
  )
}

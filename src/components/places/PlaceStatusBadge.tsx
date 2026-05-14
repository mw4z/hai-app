'use client'

import type { PlaceStatus } from '@prisma/client'
import { useLanguage } from '@/hooks/useLanguage'
import { getStatusBadge } from '@/lib/places/statusBadge'

/** Small pill rendering the trilingual label for a place status.
 *  Color tone comes from the central badge map so every surface
 *  shares the same palette. */
export default function PlaceStatusBadge({ status }: { status: PlaceStatus }) {
  const { lang } = useLanguage()
  const meta = getStatusBadge(status)
  const label = lang === 'en' ? meta.labelEn : lang === 'ur' ? meta.labelUr : meta.labelAr

  const TONES: Record<typeof meta.tone, string> = {
    gray:    'bg-gray-100  text-gray-700    dark:bg-gray-800     dark:text-gray-300',
    amber:   'bg-amber-100 text-amber-800   dark:bg-amber-900/40 dark:text-amber-300',
    sky:     'bg-sky-100   text-sky-800     dark:bg-sky-900/40   dark:text-sky-300',
    emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    rose:    'bg-rose-100  text-rose-800    dark:bg-rose-900/40  dark:text-rose-300',
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${TONES[meta.tone]}`}>
      {label}
    </span>
  )
}

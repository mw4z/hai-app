'use client'

import { useCallback } from 'react'
import { FiMapPin, FiNavigation, FiCopy } from 'react-icons/fi'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import { hapticLight } from '@/lib/haptic'

interface Props {
  name: string
  lat: number
  lng: number
  url: string
  variant?: 'light' | 'onGreen'
}

/**
 * Inline location card rendered inside comments / chat messages when
 * a `📍 Name\n<map URL>` snippet is detected. Shows the place name +
 * coords with two quick actions: Open in Maps, Copy.
 *
 * Mirrors ContactChip's visual rhythm so a thread mixing contacts +
 * locations reads as one coherent set of inline cards rather than two
 * different design systems.
 */
export default function LocationChip({ name, lat, lng, url, variant = 'light' }: Props) {
  const { lang } = useLanguage()
  const onGreen = variant === 'onGreen'

  const handleOpen = useCallback(() => {
    hapticLight()
    // _system on Capacitor routes to the OS map app via Custom Tabs /
    // intent dispatch; on web it opens a new tab.
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [url])

  const handleCopy = useCallback(() => {
    hapticLight()
    navigator.clipboard?.writeText(url).then(() => {
      toast.success(lang === 'en' ? 'Copied!' : lang === 'ur' ? 'کاپی ہو گیا!' : 'تم النسخ!')
    }).catch(() => { /* ignore */ })
  }, [url, lang])

  const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`

  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl px-3 py-3 my-1.5 w-full overflow-hidden ${
        onGreen
          ? 'bg-white/15 border border-white/20'
          : 'bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
            onGreen ? 'bg-white/20' : 'bg-sky-100 dark:bg-sky-800/60'
          }`}
        >
          <FiMapPin className={`w-4 h-4 ${onGreen ? 'text-white' : 'text-sky-700 dark:text-sky-300'}`} />
        </div>
        <div className="min-w-0 flex-1">
          {name && (
            <p className={`text-sm font-bold truncate ${onGreen ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
              {name}
            </p>
          )}
          <p
            className={`text-xs font-semibold tabular-nums ${onGreen ? 'text-white/80' : 'text-sky-700 dark:text-sky-300'}`}
            dir="ltr"
          >
            {coords}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={handleOpen}
          className={`flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-bold active:scale-[0.97] transition-transform whitespace-nowrap ${
            onGreen ? 'bg-white/25 text-white' : 'bg-sky-600 text-white'
          }`}
        >
          <FiNavigation className="w-3.5 h-3.5 flex-shrink-0" />
          {lang === 'en' ? 'Open in Maps' : lang === 'ur' ? 'نقشے میں کھولیں' : 'فتح في الخرائط'}
        </button>
        <button
          onClick={handleCopy}
          className={`flex items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-bold active:scale-[0.97] transition-transform whitespace-nowrap ${
            onGreen ? 'bg-white/15 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
          }`}
        >
          <FiCopy className="w-3.5 h-3.5 flex-shrink-0" />
          {lang === 'en' ? 'Copy' : lang === 'ur' ? 'کاپی' : 'نسخ'}
        </button>
      </div>
    </div>
  )
}

'use client'

import { useLanguage } from '@/hooks/useLanguage'

/**
 * Source-attribution chip for a directory listing.
 *
 *   GOOGLE → "Google" pill (REQUIRED attribution under Google's
 *            Places ToS whenever we show their rating/hours/photos).
 *   LOCAL  → "من الجيران / Community" pill — added/typed by a neighbor.
 *
 * Two visually distinct marks so users instantly know whether a
 * listing is Google-sourced or community-contributed.
 */
export default function PlaceSourceBadge({
  source,
  size = 'sm',
}: {
  source: 'LOCAL' | 'GOOGLE'
  size?: 'sm' | 'xs'
}) {
  const { lang } = useLanguage()
  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[9.5px]' : 'px-2 py-0.5 text-[10.5px]'

  if (source === 'GOOGLE') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full font-bold border ${pad} bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`}
        title="Data from Google"
      >
        {/* Google "G" in brand colors */}
        <span aria-hidden className="font-black leading-none">
          <span style={{ color: '#4285F4' }}>G</span>
          <span style={{ color: '#EA4335' }}>o</span>
          <span style={{ color: '#FBBC05' }}>o</span>
          <span style={{ color: '#4285F4' }}>g</span>
          <span style={{ color: '#34A853' }}>l</span>
          <span style={{ color: '#EA4335' }}>e</span>
        </span>
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${pad} bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800`}
    >
      🏘️ {lang === 'en' ? 'Community' : lang === 'ur' ? 'کمیونٹی' : 'من الجيران'}
    </span>
  )
}

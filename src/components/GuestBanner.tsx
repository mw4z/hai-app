'use client'

import Link from 'next/link'
import { FiMapPin, FiChevronRight } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'

/**
 * Persistent banner shown to users with addressVerified=false.
 * Only rendered when the `show` prop is true (passed from the server
 * component that has access to the user's verification status).
 */
export default function GuestBanner({ show }: { show: boolean }) {
  const { lang } = useLanguage()
  if (!show) return null

  return (
    <Link
      href="/verify-location"
      className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2 active:bg-amber-100 dark:active:bg-amber-900/40 transition-colors"
    >
      <FiMapPin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
      <span className="flex-1 text-[11px] text-amber-800 dark:text-amber-300 font-medium">
        {lang === 'en'
          ? 'Limited access — verify your location to unlock full features'
          : lang === 'ur'
            ? 'محدود رسائی — مکمل خصوصیات کیلئے مقام کی تصدیق کریں'
            : 'وصول محدود — تحقّق من موقعك لفتح جميع المزايا'}
      </span>
      <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold whitespace-nowrap">
        {lang === 'en' ? 'Verify →' : 'تحقّق ←'}
      </span>
    </Link>
  )
}

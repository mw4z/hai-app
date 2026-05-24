'use client'

import Link from 'next/link'
import { FiMapPin, FiChevronRight } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'

/**
 * Persistent banner shown to a CLAIMED resident (addressVerified=false,
 * has a home). Explains the limited-rights state without shaming, and
 * points to the fastest upgrade path (confirm location via GPS). A mod
 * also reviews their pending claim, so verifying isn't the only route.
 * Only rendered when `show` is true (server passes the membership state).
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
          ? 'Linked to your neighborhood — confirm your location to unlock full resident permissions'
          : lang === 'ur'
            ? 'محلے سے منسلک — مکمل رہائشی اختیارات کیلئے اپنا مقام تصدیق کریں'
            : 'مرتبط بالحي — أكّد سكنك داخل الحي لتفعيل كامل صلاحيات الساكن، أو سيراجع المشرف طلبك'}
      </span>
      <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold whitespace-nowrap">
        {lang === 'en' ? 'Confirm →' : 'تأكيد ←'}
      </span>
    </Link>
  )
}

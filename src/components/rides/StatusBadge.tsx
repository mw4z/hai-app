'use client'

import { useLanguage } from '@/hooks/useLanguage'

const STATUS_CONFIG: Record<string, { ar: string; en: string; bg: string; text: string }> = {
  RIDE_OPEN:                 { ar: 'مفتوح',          en: 'Open',           bg: 'bg-green-100 dark:bg-green-900/40',   text: 'text-green-700 dark:text-green-300' },
  RIDE_SELECTED:             { ar: 'بانتظار التأكيد', en: 'Awaiting Confirm', bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
  RIDE_CONFIRMED:            { ar: 'مؤكد',           en: 'Confirmed',      bg: 'bg-blue-100 dark:bg-blue-900/40',     text: 'text-blue-700 dark:text-blue-300' },
  RIDE_EN_ROUTE:             { ar: 'في الطريق',      en: 'En Route',       bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300' },
  RIDE_ARRIVED:              { ar: 'وصل',             en: 'Arrived',        bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
  RIDE_IN_PROGRESS:          { ar: 'جاري',           en: 'In Progress',    bg: 'bg-sky-100 dark:bg-sky-900/40',       text: 'text-sky-700 dark:text-sky-300' },
  RIDE_PENDING_COMPLETION:   { ar: 'بانتظار التأكيد', en: 'Pending Confirm', bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300' },
  RIDE_COMPLETED:            { ar: 'مكتملة',         en: 'Completed',      bg: 'bg-green-100 dark:bg-green-900/40',   text: 'text-green-700 dark:text-green-300' },
  RIDE_CANCELLED:            { ar: 'ملغاة',          en: 'Cancelled',      bg: 'bg-red-100 dark:bg-red-900/40',       text: 'text-red-700 dark:text-red-300' },
  RIDE_EXPIRED:              { ar: 'منتهية',         en: 'Expired',        bg: 'bg-gray-100 dark:bg-gray-700',        text: 'text-gray-600 dark:text-gray-300' },
  RIDE_DISPUTED:             { ar: 'قيد المراجعة',   en: 'Disputed',       bg: 'bg-yellow-100 dark:bg-yellow-900/40', text: 'text-yellow-700 dark:text-yellow-300' },
}

export default function StatusBadge({ status }: { status: string }) {
  const { lang } = useLanguage()
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.RIDE_OPEN
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${config.bg} ${config.text}`}>
      {lang !== 'en' ? config.ar : config.en}
    </span>
  )
}

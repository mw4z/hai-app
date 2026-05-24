'use client'

import Link from 'next/link'
import { FiMapPin } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'

/**
 * Persistent strip shown to a CLAIMED resident (addressVerified=false, has a
 * home). Intentionally NEUTRAL — it confirms the user can take part with
 * their neighbors and gently explains that confirming residence helps keep
 * the neighborhood trusted. It does NOT imply the user is broadly blocked
 * (restrictions are surfaced only when a sensitive feature is attempted).
 * Tapping it opens the (optional) GPS confirmation flow.
 * Only rendered when `show` is true (server passes the membership state).
 */
export default function GuestBanner({
  show,
  neighborhoodName,
}: {
  show: boolean
  neighborhoodName?: string | null
}) {
  const { lang } = useLanguage()
  if (!show) return null

  const name = neighborhoodName?.trim() || ''
  const primary =
    lang === 'en'
      ? name
        ? `Your neighborhood: ${name} — verify your location for more features`
        : 'Verify your location for more features'
      : lang === 'ur'
        ? name
          ? `آپ کا محلہ: ${name} — مزید مزایا کے لیے اپنے مقام کی تصدیق کریں`
          : 'مزید مزایا کے لیے اپنے مقام کی تصدیق کریں'
        : name
          ? `حيّك الحالي: ${name} — وثّق موقعك لمزايا أكثر`
          : 'وثّق موقعك لمزايا أكثر'
  const helper =
    lang === 'en'
      ? 'Confirming your residence helps keep the neighborhood trusted.'
      : lang === 'ur'
        ? 'رہائش کی تصدیق محلے کے اعتماد کو برقرار رکھنے میں مدد دیتی ہے۔'
        : 'تأكيد السكن يساعدنا نحافظ على موثوقية الحي.'

  return (
    <>
      {/* Paint the top safe-area with the SAME amber as this banner so the
          status-bar strip reads as one continuous band with it (no dark gap
          above). Mirrors the read-only banner: opaque #362822 (amber-900
          pre-composited over the dark page bg) on BOTH the cover and the
          banner so they match exactly. Reverts automatically when the banner
          unmounts (show=false). */}
      <style>{`
        html { --hai-safe-top-bg: rgb(255 251 235) !important; }
        html.dark { --hai-safe-top-bg: #362822 !important; }
      `}</style>
      <Link
        href="/verify-location"
        className="flex items-center gap-2 bg-amber-50 dark:bg-[#362822] border-b border-amber-200 dark:border-amber-800 px-4 py-2 active:bg-amber-100 dark:active:bg-amber-900/40 transition-colors"
      >
        <FiMapPin className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] text-amber-800 dark:text-amber-300 font-medium leading-snug">
            {primary}
          </span>
          <span className="block text-[10px] text-amber-700/80 dark:text-amber-300/70 leading-snug">
            {helper}
          </span>
        </span>
        <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold whitespace-nowrap flex-shrink-0">
          {lang === 'en' ? 'Confirm →' : lang === 'ur' ? 'تصدیق ←' : 'تأكيد ←'}
        </span>
      </Link>
    </>
  )
}

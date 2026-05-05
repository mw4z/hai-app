'use client'

import { useEffect, useState } from 'react'
import { FiWifiOff, FiCheckCircle } from 'react-icons/fi'
import { useNetworkStatus } from '@/lib/network'
import { useLanguage } from '@/hooks/useLanguage'

/**
 * App-wide offline banner. Mounted once at the root layout.
 *
 *  - Status === 'offline' → persistent banner pinned below the
 *    status bar, AR/EN copy, dark/light aware, never blocks
 *    navigation.
 *  - Status === 'unstable' → no banner (silent — would be too
 *    noisy for transient flakes; users only see it if it persists
 *    and the second probe fails).
 *  - Reconnect transition → 2.5s "Back online" toast that auto-
 *    dismisses, so the user knows it's safe to retry.
 *
 * Uses inline styles + Tailwind so it works regardless of which
 * page is active and doesn't depend on per-page providers.
 */
export default function OfflineBanner() {
  const { status, lastReconnectAt } = useNetworkStatus()
  const { lang } = useLanguage()
  const [showReconnect, setShowReconnect] = useState(false)
  // Delay before the offline banner actually renders. Catches
  // transient blips — radio still negotiating on cold-start, brief
  // tunnel between cell towers, etc. The status flip already debounces
  // at the NetworkProvider layer, but THIS layer guarantees the banner
  // never flashes for sub-second outages.
  const [confirmedOffline, setConfirmedOffline] = useState(false)
  const OFFLINE_DEBOUNCE_MS = 1500

  useEffect(() => {
    if (!lastReconnectAt) return
    setShowReconnect(true)
    const t = setTimeout(() => setShowReconnect(false), 2500)
    return () => clearTimeout(t)
  }, [lastReconnectAt])

  // Banner: only show after the status has been 'offline' continuously
  // for OFFLINE_DEBOUNCE_MS. Snap back instantly when status changes.
  useEffect(() => {
    if (status !== 'offline') {
      setConfirmedOffline(false)
      return
    }
    const t = setTimeout(() => setConfirmedOffline(true), OFFLINE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [status])

  if (!confirmedOffline && !showReconnect) return null

  // Pinned just under the status bar. z-index above app chrome but
  // below modals/sheets so it never covers actionable UI.
  const baseStyle: React.CSSProperties = {
    position: 'fixed',
    top: 'env(safe-area-inset-top, 0px)',
    left: 0,
    right: 0,
    zIndex: 60,
    pointerEvents: 'none', // banner is informational only
  }

  if (confirmedOffline) {
    return (
      <div style={baseStyle} aria-live="assertive" role="status">
        <div className="mx-auto max-w-[480px] px-3 pt-2">
          <div className="flex items-start gap-2 rounded-2xl px-3 py-2.5 shadow-lg
                          bg-red-600 text-white
                          dark:bg-red-500/95">
            <FiWifiOff className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0 leading-snug">
              <p className="text-[13px] font-semibold">
                {lang === 'en'
                  ? 'No internet connection'
                  : lang === 'ur'
                    ? 'انٹرنیٹ کنکشن نہیں ہے'
                    : 'لا يوجد اتصال بالإنترنت'}
              </p>
              <p className="text-[11px] opacity-90">
                {lang === 'en'
                  ? 'Check your connection and try again'
                  : lang === 'ur'
                    ? 'اپنے کنکشن کی جانچ کریں اور دوبارہ کوشش کریں'
                    : 'تحقق من اتصالك وحاول مرة أخرى'}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Brief "Back online" confirmation
  return (
    <div style={baseStyle} aria-live="polite" role="status">
      <div className="mx-auto max-w-[480px] px-3 pt-2">
        <div className="flex items-center gap-2 rounded-2xl px-3 py-2 shadow-lg
                        bg-green-600 text-white
                        dark:bg-green-500/95
                        animate-fade-in-up">
          <FiCheckCircle className="w-4 h-4 flex-shrink-0" />
          <p className="text-[12px] font-semibold">
            {lang === 'en' ? 'Back online' : lang === 'ur' ? 'دوبارہ آن لائن' : 'تم استعادة الاتصال'}
          </p>
        </div>
      </div>
    </div>
  )
}

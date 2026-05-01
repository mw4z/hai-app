'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useLanguage } from '@/hooks/useLanguage'
import StatusBadge from '@/components/rides/StatusBadge'
import RiyalIcon from '@/components/RiyalIcon'
import { FiPlus, FiMapPin, FiNavigation, FiClock, FiAlertTriangle, FiPackage } from 'react-icons/fi'

type Tab = 'all' | 'mine' | 'offers'

export default function RidesFeedClient({ userId }: { userId: string }) {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const [tab, setTab] = useState<Tab>('all')
  const [rides, setRides] = useState<any[]>([])
  const [myRequests, setMyRequests] = useState<any[]>([])
  const [myOffers, setMyOffers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    if (tab === 'all') {
      fetch('/api/rides').then(r => r.json()).then(d => { setRides(d.rides || []); setLoading(false) }).catch(() => setLoading(false))
    } else {
      fetch('/api/rides/mine').then(r => r.json()).then(d => {
        setMyRequests(d.myRequests || [])
        setMyOffers(d.myOffers || [])
        setLoading(false)
      }).catch(() => setLoading(false))
    }
  }, [tab])

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (tab === 'all') {
        fetch('/api/rides').then(r => r.json()).then(d => setRides(d.rides || [])).catch(() => {})
      } else {
        fetch('/api/rides/mine').then(r => r.json()).then(d => { setMyRequests(d.myRequests || []); setMyOffers(d.myOffers || []) }).catch(() => {})
      }
    }, 10000)
    return () => clearInterval(id)
  }, [tab])

  function timeAgo(dateStr: string): string {
    const sec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
    if (sec < 60) return lang === 'en' ? 'now' : lang === 'ur' ? 'ابھی' : 'الآن'
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min} ${t('ride_min')}`
    const hr = Math.floor(min / 60)
    return `${hr} ${lang === 'en' ? 'hr' : lang === 'ur' ? 'گھنٹہ' : 'ساعة'}`
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'all', label: t('rides_all_tab') },
    { key: 'mine', label: t('rides_my_tab') },
    { key: 'offers', label: t('rides_offers_tab') },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      {/* Header */}
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 gap-2">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('rides_title')}</h1>
          <div className="flex items-center gap-2">
            <Link
              href="/rides/new?type=delivery"
              className="bg-amber-500 text-white rounded-full px-4 py-2.5 text-sm font-semibold flex items-center gap-1.5 active:scale-95 transition-transform shadow-sm"
            >
              <FiPackage className="w-4 h-4" />
              {lang === 'en' ? 'Delivery' : lang === 'ur' ? 'ڈیلیوری' : 'توصيل'}
            </Link>
            <Link
              href="/rides/new"
              className="bg-primary-600 text-white rounded-full px-4 py-2.5 text-sm font-semibold flex items-center gap-1.5 active:scale-95 transition-transform shadow-sm"
            >
              <FiPlus className="w-4 h-4" /> {t('rides_new')}
            </Link>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex px-4 pb-3 gap-2">
          {TABS.map(tb => (
            <button key={tb.key} onClick={() => setTab(tb.key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                tab === tb.key
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}>
              {tb.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 pt-4 space-y-3">
        {loading && (
          <div className="flex justify-center py-10 text-primary-600"><div className="hai-loader" style={{width:40,height:40}}><svg viewBox="0 0 64 64" fill="none" className="w-full h-full"><circle className="hai-dot hai-dot-center" cx="32" cy="35" r="6" fill="currentColor"/><circle className="hai-dot hai-dot-top" cx="32" cy="15" r="4" fill="currentColor"/><circle className="hai-dot hai-dot-br" cx="48" cy="47" r="4" fill="currentColor"/><circle className="hai-dot hai-dot-bl" cx="16" cy="47" r="4" fill="currentColor"/></svg></div></div>
        )}

        {/* All rides */}
        {!loading && tab === 'all' && (
          rides.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🚗</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm">{t('rides_empty')}</p>
            </div>
          ) : rides.map((r: any, idx: number) => (
            <button key={r.id} onClick={() => router.push(`/rides/${r.id}`)}
              style={{ animationDelay: `${Math.min(idx * 60, 400)}ms`, animationFillMode: 'backwards' }}
              className="w-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 text-start active:scale-[0.99] transition-transform animate-fade-in-up">
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white min-w-0">
                  <FiMapPin className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
                  <span className="truncate">{r.pickupArea}</span>
                  <FiNavigation className="w-3 h-3 text-gray-300 flex-shrink-0" />
                  <span className="truncate">{r.dropoffArea}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {r.type === 'DELIVERY' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                      📦 {lang === 'en' ? 'Delivery' : lang === 'ur' ? 'ڈیلیوری' : 'توصيل'}
                    </span>
                  )}
                  {r.isLate && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 flex items-center gap-0.5">
                      <FiAlertTriangle className="w-3 h-3" /> {t('rides_late')}
                    </span>
                  )}
                </div>
              </div>
              {r.type === 'DELIVERY' && r.itemDescription && (
                <p className="text-xs text-gray-600 dark:text-gray-300 mb-2 line-clamp-1">{r.itemDescription}</p>
              )}
              <div className="flex items-center gap-4 text-[11px] text-gray-400 dark:text-gray-500">
                <span>{r.distanceKm} {t('ride_km')}</span>
                <span>{r.durationMin} {t('ride_min')}</span>
                <span className="flex items-center gap-0.5"><FiClock className="w-3 h-3" /> {timeAgo(r.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between mt-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary-100 overflow-hidden flex-shrink-0">
                    {r.requester?.avatarUrl ? <img src={r.requester.avatarUrl} alt="" className="w-full h-full object-cover" /> : null}
                  </div>
                  <span className="text-xs text-gray-600 dark:text-gray-300">{r.requester?.name || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {r.isImmediate ? (
                    <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full font-medium">{t('ride_now')}</span>
                  ) : (
                    <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                      {new Date(r.scheduledAt).toLocaleTimeString(lang !== 'en' ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400">{r.offerCount} {t('rides_offers')}</span>
                </div>
              </div>
            </button>
          ))
        )}

        {/* My requests */}
        {!loading && tab === 'mine' && (
          myRequests.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-500 dark:text-gray-400 text-sm">{lang === 'en' ? 'No requests' : lang === 'ur' ? 'کوئی درخواست نہیں' : 'لا توجد طلبات'}</p>
            </div>
          ) : myRequests.map((r: any) => (
            <button key={r.id} onClick={() => router.push(`/rides/${r.id}`)}
              className="w-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 text-start">
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{r.pickupArea} {lang !== 'en' ? '←' : '→'} {r.dropoffArea}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {r.type === 'DELIVERY' && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">📦</span>
                  )}
                  <StatusBadge status={r.status} />
                </div>
              </div>
              <div className="text-[11px] text-gray-400">{r.distanceKm} {t('ride_km')} · {r._count?.offers || 0} {t('rides_offers')}</div>
            </button>
          ))
        )}

        {/* My offers */}
        {!loading && tab === 'offers' && (
          myOffers.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-500 dark:text-gray-400 text-sm">{lang === 'en' ? 'No offers' : lang === 'ur' ? 'کوئی پیشکش نہیں' : 'لا توجد عروض'}</p>
            </div>
          ) : myOffers.map((o: any) => (
            <button key={o.id} onClick={() => router.push(`/rides/${o.rideRequest.id}`)}
              className="w-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 text-start">
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{o.rideRequest.pickupArea} {lang !== 'en' ? '←' : '→'} {o.rideRequest.dropoffArea}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {o.rideRequest.type === 'DELIVERY' && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">📦</span>
                  )}
                  <StatusBadge status={o.status} />
                </div>
              </div>
              <div className="text-[11px] text-gray-400">
                <StatusBadge status={o.rideRequest.status} />
              </div>
            </button>
          ))
        )}
      </div>

      {/* BottomNav is mounted globally in src/app/layout.tsx */}
    </div>
  )
}

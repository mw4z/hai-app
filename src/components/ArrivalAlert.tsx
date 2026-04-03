'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'

type AlertType = 'arrived' | 'selected'

interface AlertData {
  type: AlertType
  rideId: string
  otherName: string
}

const ALERT_CONFIG: Record<AlertType, {
  icon: string
  title: { ar: string; en: string; ur: string }
  body: { ar: string; en: string; ur: string }
  cta: { ar: string; en: string; ur: string }
}> = {
  arrived: {
    icon: '📍',
    title: { ar: 'وصل!', en: 'Driver Arrived!', ur: 'ڈرائیور پہنچ گیا!' },
    body: { ar: 'الشخص ينتظرك عند نقطة الانطلاق', en: 'The person is waiting at the pickup point', ur: 'شخص پک اپ پوائنٹ پر منتظر ہے' },
    cta: { ar: 'افتح الرحلة', en: 'Open Ride', ur: 'سواری کھولیں' },
  },
  selected: {
    icon: '🎉',
    title: { ar: 'تم اختيارك!', en: 'You were selected!', ur: 'آپ منتخب ہو گئے!' },
    body: { ar: 'الطالب اختارك — أكّد الآن قبل انتهاء المهلة', en: 'The requester chose you — confirm now before the deadline', ur: 'درخواست گزار نے آپ کو چنا — مہلت ختم ہونے سے پہلے تصدیق کریں' },
    cta: { ar: 'أكّد الآن', en: 'Confirm Now', ur: 'ابھی تصدیق کریں' },
  },
}

/**
 * Global ride alert — mounts in layout, polls for:
 * 1. RIDE_ARRIVED (for requester) — driver at pickup
 * 2. RIDE_SELECTED (for driver) — offer was accepted
 */
export default function ArrivalAlert() {
  const { lang } = useLanguage()
  const router = useRouter()
  const [alert, setAlert] = useState<AlertData | null>(null)
  const alerted = useRef<Set<string>>(new Set())

  useEffect(() => {
    async function check() {
      try {
        // Check both statuses in parallel
        const [arrivedRes, selectedRes] = await Promise.all([
          fetch('/api/rides/mine?status=RIDE_ARRIVED'),
          fetch('/api/rides/mine?status=RIDE_SELECTED'),
        ])

        // Driver arrived → alert requester
        if (arrivedRes.ok) {
          const rides = await arrivedRes.json()
          if (Array.isArray(rides)) {
            for (const ride of rides) {
              if (ride.role !== 'requester') continue
              const key = `arrived-${ride.id}`
              if (alerted.current.has(key)) continue
              alerted.current.add(key)
              setAlert({ type: 'arrived', rideId: ride.id, otherName: ride.driverName || '' })
              import('@/lib/arrival-alert').then(m => m.triggerArrivalAlert()).catch(() => {})
              return
            }
          }
        }

        // Offer selected → alert driver
        if (selectedRes.ok) {
          const rides = await selectedRes.json()
          if (Array.isArray(rides)) {
            for (const ride of rides) {
              if (ride.role !== 'driver') continue
              const key = `selected-${ride.id}`
              if (alerted.current.has(key)) continue
              alerted.current.add(key)
              setAlert({ type: 'selected', rideId: ride.id, otherName: ride.requesterName || '' })
              import('@/lib/arrival-alert').then(m => m.triggerArrivalAlert()).catch(() => {})
              return
            }
          }
        }
      } catch { /* not logged in or network error */ }
    }

    check()
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      check()
    }, 8000)
    return () => clearInterval(id)
  }, [])

  if (!alert) return null

  const config = ALERT_CONFIG[alert.type]
  const t = (obj: { ar: string; en: string; ur: string }) =>
    lang === 'en' ? obj.en : lang === 'ur' ? obj.ur : obj.ar

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-6" onClick={() => setAlert(null)}>
      <div
        className="bg-white dark:bg-gray-800 rounded-3xl p-8 max-w-sm w-full text-center"
        style={{ animation: 'arrivalIn 0.4s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="text-6xl mb-4" style={{ animation: 'arrivalPulse 1.5s ease-in-out infinite' }}>{config.icon}</div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {t(config.title)}
        </h2>
        {alert.otherName && (
          <p className="text-primary-600 font-semibold mb-1">{alert.otherName}</p>
        )}
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
          {t(config.body)}
        </p>
        <div className="space-y-2">
          <button
            onClick={() => { setAlert(null); router.push(`/rides/${alert.rideId}`) }}
            className="w-full bg-primary-600 text-white py-3.5 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
          >
            {t(config.cta)}
          </button>
          <button
            onClick={() => setAlert(null)}
            className="w-full text-gray-400 py-2 text-xs font-medium"
          >
            {lang === 'en' ? 'Dismiss' : lang === 'ur' ? 'بند کریں' : 'تمام'}
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes arrivalIn {
          0% { opacity: 0; transform: scale(0.85); }
          60% { opacity: 1; transform: scale(1.02); }
          100% { transform: scale(1); }
        }
        @keyframes arrivalPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
      `}</style>
    </div>
  )
}

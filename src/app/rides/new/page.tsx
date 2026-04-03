'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import BackButton from '@/components/BackButton'
import LocationPicker from '@/components/rides/LocationPicker'
import RiyalIcon from '@/components/RiyalIcon'
import { FiNavigation, FiClock, FiFileText } from 'react-icons/fi'
import { useContextTour } from '@/components/Tour'

interface Location {
  lat: number
  lng: number
  address: string
  area: string
}

export default function NewRidePage() {
  const router = useRouter()
  const { t, lang } = useLanguage()

  const [pickup, setPickup] = useState<Location | null>(null)
  const [dropoff, setDropoff] = useState<Location | null>(null)
  const [isImmediate, setIsImmediate] = useState(true)
  const [scheduledAt, setScheduledAt] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [estimate, setEstimate] = useState<{ km: number; min: number } | null>(null)

  // Recalculate distance/time when both locations set
  useEffect(() => {
    if (!pickup || !dropoff) { setEstimate(null); return }
    const R = 6371
    const dLat = (dropoff.lat - pickup.lat) * Math.PI / 180
    const dLng = (dropoff.lng - pickup.lng) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(pickup.lat * Math.PI / 180) * Math.cos(dropoff.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    const km = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10
    const min = km <= 5 ? Math.round(km / 25 * 60) : km <= 30 ? Math.round(km / 35 * 60) : Math.round(km / 80 * 60)
    setEstimate({ km, min })
  }, [pickup, dropoff])

  async function handleSubmit() {
    if (loading) return // Prevent double-submit
    if (!pickup) { toast.error(lang === 'en' ? 'Set pickup location' : lang === 'ur' ? 'اٹھانے کی جگہ مقرر کریں' : 'حدد نقطة الانطلاق'); return }
    if (!dropoff) { toast.error(lang === 'en' ? 'Set drop-off location' : lang === 'ur' ? 'منزل مقرر کریں' : 'حدد الوجهة'); return }
    if (!isImmediate && !scheduledAt) { toast.error(lang === 'en' ? 'Set trip time' : lang === 'ur' ? 'سفر کا وقت مقرر کریں' : 'حدد وقت الرحلة'); return }
    // Validate coordinates are real numbers
    if (!pickup.lat || !pickup.lng || !dropoff.lat || !dropoff.lng ||
        isNaN(pickup.lat) || isNaN(pickup.lng) || isNaN(dropoff.lat) || isNaN(dropoff.lng)) {
      toast.error(lang === 'en' ? 'Invalid location data' : 'بيانات الموقع غير صالحة'); return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/rides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          pickupAddress: pickup.address,
          pickupArea: pickup.area || pickup.address.split(',')[0],
          dropoffLat: dropoff.lat,
          dropoffLng: dropoff.lng,
          dropoffAddress: dropoff.address,
          dropoffArea: dropoff.area || dropoff.address.split(',')[0],
          isImmediate,
          scheduledAt: isImmediate ? undefined : scheduledAt,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(lang !== 'en' ? (data.message || data.error) : (data.messageEn || data.error))
        return
      }
      toast.success(lang === 'en' ? 'Request published' : lang === 'ur' ? 'درخواست شائع ہو گئی' : 'تم نشر طلبك')
      router.push(`/rides/${data.id}`)
    } catch {
      toast.error(lang === 'en' ? 'Connection error' : lang === 'ur' ? 'رابطہ ناکام' : 'تعذر الاتصال')
    } finally {
      setLoading(false)
    }
  }

  useContextTour('ride_create')

  const canSubmit = !!pickup && !!dropoff && (isImmediate || !!scheduledAt)

  return (
    <main className="min-h-screen bg-white dark:bg-gray-900 flex flex-col">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <BackButton href="/rides" />
        <h1 className="flex-1 text-center font-bold text-gray-900 dark:text-white">{t('rides_new')}</h1>
        <div className="w-6" />
      </header>

      <div className="flex-1 px-4 py-5 space-y-5">

        {/* ── Pickup Location ──────────────────────────────────────────────── */}
        <div data-tour="ride-pickup">
        <LocationPicker type="pickup" value={pickup} onChange={setPickup} />
        </div>

        {/* ── Route line between pickup and dropoff ────────────────────────── */}
        {pickup && (
          <div className="flex justify-center">
            <div className="w-0.5 h-6 bg-gray-200 dark:bg-gray-700" />
          </div>
        )}

        {/* ── Dropoff Location ─────────────────────────────────────────────── */}
        <div data-tour="ride-dropoff">
        <LocationPicker type="dropoff" value={dropoff} onChange={setDropoff} userLat={pickup?.lat} userLng={pickup?.lng} />
        </div>

        {/* ── Estimate Preview ─────────────────────────────────────────────── */}
        {estimate && (
          <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-2xl p-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <FiNavigation className="w-4 h-4 text-primary-600" />
                <span className="font-semibold">{estimate.km} {t('ride_km')}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <FiClock className="w-4 h-4 text-primary-600" />
                <span>~{estimate.min} {t('ride_min')}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Time Selection ───────────────────────────────────────────────── */}
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">{t('ride_time')}</label>
          <div className="flex gap-2">
            <button onClick={() => setIsImmediate(true)}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-colors ${
                isImmediate
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
              }`}>
              {t('ride_now')}
            </button>
            <button onClick={() => setIsImmediate(false)}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-colors ${
                !isImmediate
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
              }`}>
              {t('ride_scheduled')}
            </button>
          </div>
          {!isImmediate && (
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="w-full mt-2 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          )}
        </div>

        {/* ── Notes ────────────────────────────────────────────────────────── */}
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-2">
            <FiFileText className="w-4 h-4" /> {t('ride_notes')}
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={t('ride_notes_placeholder')}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm bg-transparent text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
            rows={2}
            maxLength={200}
          />
        </div>

        {/* ── Community note + disclaimer ─────────────────────────────────── */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1.5">
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{t('ride_community_note')}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">{t('ride_disclaimer')}</p>
        </div>

        {/* ── Submit ───────────────────────────────────────────────────────── */}
        <button
          data-tour="ride-submit"
          onClick={handleSubmit}
          disabled={loading || !canSubmit}
          className="w-full bg-primary-600 text-white rounded-xl py-3.5 font-semibold text-sm active:scale-[0.97] transition-transform disabled:opacity-40"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
          ) : (
            t('ride_publish')
          )}
        </button>
      </div>
    </main>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import { FiMapPin, FiNavigation } from 'react-icons/fi'
import BackButton from '@/components/BackButton'
import { HaiSpinner } from '@/components/HaiLoader'

const REASONS = [
  { key: 'MOVED', ar: 'انتقلت إلى حي جديد', en: 'I moved to a new neighborhood' },
  { key: 'TEMPORARY', ar: 'مسافر / متواجد مؤقتاً', en: 'Traveling / temporary stay' },
  { key: 'OTHER', ar: 'سبب آخر', en: 'Other reason' },
]

function isNative(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as any).Capacitor?.isNativePlatform?.()
  )
}

export default function ChangeNeighborhoodPage() {
  const router = useRouter()
  const { t, lang } = useLanguage()

  const [detecting, setDetecting] = useState(false)
  const [detected, setDetected] = useState<{ id: string; name: string; nameEn: string; cityName: string; cityNameEn: string; confidence: string } | null>(null)
  const [gpsError, setGpsError] = useState('')
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [reason, setReason] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [info, setInfo] = useState<{ remaining: number; pendingRequest: any } | null>(null)

  useEffect(() => {
    fetch('/api/profile/change-neighborhood')
      .then(r => r.json())
      .then(setInfo)
      .catch(() => {})
  }, [])

  async function resolveNeighborhood(lat: number, lng: number) {
    try {
      const res = await fetch(`/api/neighborhoods/detect?lat=${lat}&lng=${lng}`)
      const data = await res.json()
      if (data.id) {
        setDetected({
          id: data.id,
          name: data.name,
          nameEn: data.nameEn,
          cityName: data.city?.name || '',
          cityNameEn: data.city?.nameEn || '',
          confidence: data.confidence || 'medium',
        })
      } else {
        setGpsError(lang === 'en' ? 'Could not detect your neighborhood. Make sure you are in a supported area' : lang === 'ur' ? 'آپ کا محلہ معلوم نہیں ہو سکا' : 'لم نتمكن من تحديد حيّك. تأكد من وجودك في المنطقة المستهدفة')
      }
    } catch {
      setGpsError(lang === 'en' ? 'Connection error' : lang === 'ur' ? 'رابطے میں خرابی' : 'خطأ في الاتصال')
    }
  }

  async function detectLocation() {
    setDetecting(true)
    setGpsError('')
    setPermissionDenied(false)
    setDetected(null)

    try {
      // Native path — use Capacitor Geolocation so permission requests work
      if (isNative()) {
        const { Geolocation } = await import('@capacitor/geolocation')
        const current = await Geolocation.checkPermissions()
        let state: string = current.location || 'prompt'
        if (state !== 'granted') {
          const requested = await Geolocation.requestPermissions()
          state = requested.location || 'prompt'
        }
        if (state === 'denied') {
          setPermissionDenied(true)
          setGpsError(
            lang === 'en'
              ? 'Location access is blocked. Please enable it in your device settings.'
              : lang === 'ur'
                ? 'مقام بلاک ہے — سیٹنگز میں اسے فعال کریں'
                : 'صلاحية الموقع محظورة — فعّلها من إعدادات جهازك',
          )
          setDetecting(false)
          return
        }
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        })
        await resolveNeighborhood(pos.coords.latitude, pos.coords.longitude)
        setDetecting(false)
        return
      }

      // Web fallback
      if (!navigator.geolocation) {
        setGpsError(
          lang === 'en'
            ? 'Browser does not support geolocation'
            : lang === 'ur'
              ? 'براؤزر مقام کی حمایت نہیں کرتا'
              : 'المتصفح لا يدعم تحديد الموقع',
        )
        setDetecting(false)
        return
      }
      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            await resolveNeighborhood(pos.coords.latitude, pos.coords.longitude)
            resolve()
          },
          (err) => {
            if (err.code === 1) {
              setPermissionDenied(true)
              setGpsError(
                lang === 'en'
                  ? 'Location access is blocked. Please enable it in browser settings.'
                  : lang === 'ur'
                    ? 'براؤزر سیٹنگز میں مقام کی اجازت دیں'
                    : 'صلاحية الموقع محظورة — فعّلها من إعدادات المتصفح',
              )
            } else {
              setGpsError(
                lang === 'en'
                  ? 'Could not detect location. Try again'
                  : lang === 'ur'
                    ? 'مقام معلوم نہیں ہو سکا — دوبارہ کوشش کریں'
                    : 'تعذر تحديد الموقع. حاول مرة أخرى',
              )
            }
            resolve()
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        )
      })
    } catch (err: any) {
      const msg = err?.message?.toLowerCase?.() || ''
      if (msg.includes('denied') || msg.includes('permission')) {
        setPermissionDenied(true)
        setGpsError(
          lang === 'en'
            ? 'Location access is blocked. Please enable it in your device settings.'
            : 'صلاحية الموقع محظورة — فعّلها من إعدادات جهازك',
        )
      } else {
        setGpsError(
          lang === 'en'
            ? 'Could not detect location. Try again'
            : 'تعذر تحديد الموقع. حاول مرة أخرى',
        )
      }
    } finally {
      setDetecting(false)
    }
  }

  async function openSystemSettings() {
    // iOS: the app-settings: URL scheme opens directly to the app's
    // settings page in WKWebView. Android doesn't have a clean
    // equivalent — we show instructions via toast.
    if (isNative()) {
      const platform = (window as any).Capacitor?.getPlatform?.() || 'unknown'
      if (platform === 'ios') {
        try {
          window.location.href = 'app-settings:'
          return
        } catch {
          /* fall through */
        }
      }
      toast(
        lang === 'en'
          ? 'Open device Settings → Apps → Hai → Permissions → Location → Allow'
          : 'افتح الإعدادات → التطبيقات → حي → الصلاحيات → الموقع → سماح',
        { duration: 6000 },
      )
      return
    }
    // Web fallback — can't programmatically open browser settings
    toast(
      lang === 'en'
        ? 'Click the lock icon next to the URL and enable location'
        : 'اضغط على أيقونة القفل بجانب الرابط وفعّل الموقع',
      { duration: 6000 },
    )
  }

  async function handleSubmit() {
    if (!detected) { toast.error(lang === 'en' ? 'Detect your location first' : lang === 'ur' ? 'پہلے اپنا مقام معلوم کریں' : 'حدد موقعك أولاً'); return }
    if (!reason) { toast.error(t('nbhd_change_reason')); return }
    if (reason === 'OTHER' && customReason.trim().length < 3) { toast.error(t('nbhd_change_explain')); return }

    setLoading(true)
    try {
      const res = await fetch('/api/profile/change-neighborhood', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neighborhoodId: detected.id, reason, customReason: customReason.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(typeof data.error === 'string' ? data.error : 'خطأ'); return }

      if (data.type === 'changed') {
        toast.success(t('nbhd_change_success'))
        router.push('/profile')
      } else {
        toast.success(t('nbhd_change_pending'))
        router.push('/profile')
      }
    } catch {
      toast.error('خطأ')
    } finally {
      setLoading(false)
    }
  }

  const dn = (ar: string, en: string) => (lang === 'en' && en) ? en : ar

  return (
    <main className="min-h-screen bg-white dark:bg-gray-900 flex flex-col">
      <header className="bg-white dark:bg-gray-900 sticky top-0 z-10 border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
        <BackButton href="/profile" />
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">{t('nbhd_change_title')}</h1>
      </header>

      <div className="flex-1 px-4 py-4 space-y-5">
        {/* Info banner */}
        {info && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('nbhd_changes_remaining')} <span className="font-bold text-gray-800 dark:text-white">{info.remaining}</span>
            </p>
            {info.pendingRequest && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                {lang === 'en' ? '⏳ You have a pending change request' : lang === 'ur' ? '⏳ آپ کی تبدیلی کی درخواست زیر التوا ہے' : '⏳ لديك طلب تغيير معلّق'}
              </p>
            )}
          </div>
        )}

        {/* GPS Detection */}
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {lang === 'en' ? 'Your new neighborhood will be detected via your current GPS location' : lang === 'ur' ? 'آپ کا نیا محلہ GPS سے معلوم ہوگا' : 'سيتم تحديد حيّك الجديد عبر موقعك الحالي (GPS)'}
          </p>

          <button
            onClick={detectLocation}
            disabled={detecting}
            className="w-full flex items-center justify-center gap-3 bg-primary-600 text-white rounded-xl py-4 font-semibold text-sm disabled:opacity-60 active:scale-[0.98] transition-transform"
          >
            {detecting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {lang === 'en' ? 'Detecting location...' : lang === 'ur' ? 'مقام معلوم ہو رہا ہے...' : 'جاري تحديد الموقع...'}
              </>
            ) : (
              <>
                <FiNavigation className="w-5 h-5" />
                {lang === 'en' ? 'Detect My Current Location' : lang === 'ur' ? 'میرا موجودہ مقام معلوم کریں' : 'تحديد موقعي الحالي'}
              </>
            )}
          </button>

          {/* GPS Error */}
          {gpsError && (
            <div className="bg-red-50 dark:bg-red-900/30 rounded-xl p-3">
              <p className="text-red-700 dark:text-red-300 text-xs leading-relaxed">{gpsError}</p>
              {permissionDenied && (
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={openSystemSettings}
                    className="flex-1 py-2 bg-red-600 text-white text-xs font-bold rounded-lg active:scale-95"
                  >
                    {lang === 'en' ? 'Open Settings' : lang === 'ur' ? 'سیٹنگز کھولیں' : 'افتح الإعدادات'}
                  </button>
                  <button
                    type="button"
                    onClick={detectLocation}
                    disabled={detecting}
                    className="flex-1 py-2 bg-white dark:bg-gray-800 text-red-600 border border-red-300 text-xs font-bold rounded-lg active:scale-95 disabled:opacity-50"
                  >
                    {lang === 'en' ? 'Try Again' : lang === 'ur' ? 'دوبارہ کوشش' : 'إعادة المحاولة'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Detected neighborhood */}
          {detected && (
            <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <FiMapPin className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-semibold text-green-800 dark:text-green-300">
                  {lang === 'en' ? 'Neighborhood detected' : lang === 'ur' ? 'آپ کا محلہ معلوم ہو گیا' : 'تم تحديد حيّك'}
                </span>
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{dn(detected.name, detected.nameEn)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{dn(detected.cityName, detected.cityNameEn)}</p>
              {detected.confidence === 'low' && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  {lang === 'en' ? '⚠️ Low accuracy — try again in an open area' : lang === 'ur' ? '⚠️ مقام کی درستگی کم ہے — کھلی جگہ میں دوبارہ کوشش کریں' : '⚠️ دقة الموقع منخفضة — حاول مرة أخرى في مكان مفتوح'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Reason — only show after detection */}
        {detected && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block">{t('nbhd_change_reason')}</label>
            <div className="space-y-2">
              {REASONS.map(r => (
                <button
                  key={r.key}
                  onClick={() => setReason(r.key)}
                  className={`w-full text-start px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                    reason === r.key
                      ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {lang !== 'en' ? r.ar : r.en}
                </button>
              ))}
            </div>

            {reason === 'OTHER' && (
              <textarea
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                placeholder={t('nbhd_change_explain')}
                className="input-field mt-2 resize-none"
                rows={2}
                maxLength={200}
              />
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={loading || !reason}
              className="btn-primary w-full disabled:opacity-50"
            >
              {loading ? <HaiSpinner /> : t('nbhd_change_submit')}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

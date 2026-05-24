'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiMapPin, FiLoader, FiCheck, FiArrowRight, FiArrowLeft, FiRefreshCw, FiSettings } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { useGPSLocation } from '@/hooks/useGPSLocation'

type Step = 'ask' | 'detecting' | 'confirm' | 'nearby' | 'denied' | 'timeout'

interface Nbhd {
  id: string
  name: string
  nameEn: string
  distanceKm: number
  city: { name: string; nameEn: string }
}

export default function VerifyLocationPage() {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const dn = (ar: string, en: string) => (lang === 'en' && en ? en : ar)

  const [step, setStep] = useState<Step>('ask')
  const [loading, setLoading] = useState(false)
  const [nearbyList, setNearbyList] = useState<Nbhd[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const [userAccuracy, setUserAccuracy] = useState<number | null>(null)

  const gps = useGPSLocation()

  function isNativePlatform(): boolean {
    return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()
  }

  async function openSystemSettings() {
    if (isNativePlatform()) {
      const platform = (window as any).Capacitor?.getPlatform?.() || 'unknown'
      if (platform === 'ios') {
        try { window.location.href = 'app-settings:'; return } catch { /* */ }
      }
      toast(lang === 'en' ? 'Settings → Apps → Hai → Permissions → Location → Allow' : 'الإعدادات → التطبيقات → حي → الصلاحيات → الموقع → سماح', { duration: 6000 })
      return
    }
    toast(lang === 'en' ? 'Click the lock icon next to the URL and enable location' : 'اضغط أيقونة القفل بجانب الرابط وفعّل الموقع', { duration: 6000 })
  }

  async function retryAfterSettings() {
    if (isNativePlatform()) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation')
        const status = await Geolocation.checkPermissions()
        if (status.location === 'denied') {
          toast.error(lang === 'en' ? 'Location is still disabled. Enable it in Settings first.' : 'الموقع ما زال معطلاً — فعّله من الإعدادات أولاً')
          return
        }
      } catch { /* */ }
    }
    start()
  }

  function start() {
    setStep('detecting')
    setNearbyList([])
    setSelectedId('')
    gps.startCollecting()
  }

  useEffect(() => {
    if (gps.collecting) return
    if (step !== 'detecting') return
    const { result, error } = gps
    if (error === 'denied' || error === 'unavailable') { setStep('denied'); return }
    if (error === 'timeout' || (!result && !error)) { setStep('timeout'); return }
    if (result) {
      if (error === 'low_accuracy') {
        fetchNearby(result.lat, result.lng, result.accuracy)
      } else {
        resolve(result.lat, result.lng, result.accuracy)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps.collecting])

  async function resolve(lat: number, lng: number, accuracy: number) {
    setUserLat(lat); setUserLng(lng); setUserAccuracy(accuracy)
    try {
      const res = await fetch(`/api/neighborhoods/detect?lat=${lat}&lng=${lng}&accuracy=${accuracy}`)
      if (!res.ok) { fetchNearby(lat, lng, accuracy); return }
      const data = await res.json()
      if (data.confidence === 'low') { fetchNearby(lat, lng, accuracy); return }
      setNearbyList([data])
      setSelectedId(data.id)
      setStep('confirm')
    } catch { fetchNearby(lat, lng, accuracy) }
  }

  async function fetchNearby(lat: number, lng: number, accuracy: number) {
    setUserLat(lat); setUserLng(lng); setUserAccuracy(accuracy)
    setStep('nearby')
    try {
      const res = await fetch(`/api/neighborhoods/detect?lat=${lat}&lng=${lng}&accuracy=${accuracy}&nearby=true`)
      const data = await res.json()
      const list: Nbhd[] = (Array.isArray(data) ? data : []).slice(0, 4)
      setNearbyList(list)
      if (list.length > 0) setSelectedId(list[0].id)
    } catch { setNearbyList([]) }
  }

  async function handleConfirm() {
    if (!selectedId || userLat == null || userLng == null) return
    setLoading(true)
    try {
      const res = await fetch('/api/profile/verify-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: userLat, lng: userLng, accuracy: userAccuracy, neighborhoodId: selectedId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.error === 'neighborhood_mismatch') {
          toast.error(lang === 'en' ? "This neighborhood doesn't match your location" : 'هذا الحي لا يتطابق مع موقعك')
          return
        }
        toast.error(t('auth_connection_err') || 'Error')
        return
      }
      toast.success(lang === 'en' ? 'Location verified!' : 'تم التحقق من موقعك!')
      router.push('/feed')
      router.refresh()
    } catch {
      toast.error(t('auth_connection_err') || 'Error')
    } finally { setLoading(false) }
  }

  return (
    <main className="min-h-screen bg-white dark:bg-gray-900 flex flex-col">
      <header className="bg-white dark:bg-gray-900 sticky top-0 z-10 border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500">
          {lang !== 'en' ? <FiArrowRight className="w-5 h-5" /> : <FiArrowLeft className="w-5 h-5" />}
        </button>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">
          {lang === 'en' ? 'Verify your location' : lang === 'ur' ? 'مقام کی تصدیق کریں' : 'التحقق من موقعك'}
        </h1>
      </header>

      <div className="flex-1 px-6 py-6 flex flex-col">
        {step === 'ask' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-20 h-20 rounded-full bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
              <FiMapPin className="w-10 h-10 text-primary-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {lang === 'en' ? 'Confirm your residence' : 'تأكيد سكنك في الحي'}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs leading-relaxed">
              {lang === 'en'
                ? "Confirming you're inside the neighborhood enables trusted features like alerts, voting, and the marketplace — and helps keep the neighborhood trusted."
                : 'تأكيد موقعك داخل الحي يفعّل المزايا الموثوقة مثل التنبيهات والتصويت والسوق، ويساعدنا نحافظ على موثوقية الحي.'}
            </p>
            <button onClick={start} className="btn-primary mt-4 w-full max-w-xs flex items-center justify-center gap-2">
              <FiMapPin className="w-4 h-4" />
              {lang === 'en' ? 'Verify location' : 'تحقق من موقعي'}
            </button>
          </div>
        )}

        {step === 'detecting' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
            <FiLoader className="w-10 h-10 text-primary-600 animate-spin" />
            <p className="text-sm text-gray-500">
              {lang === 'en' ? 'Detecting your location...' : 'جاري تحديد موقعك...'}
              {gps.sampleCount > 0 && ` (${gps.sampleCount}/3)`}
            </p>
          </div>
        )}

        {step === 'confirm' && nearbyList[0] && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
              {lang === 'en' ? 'Confirm your neighborhood' : 'أكّد حيّك'}
            </h2>
            <div className="bg-primary-50 dark:bg-primary-900/30 border-2 border-primary-200 dark:border-primary-700 rounded-2xl p-5 mb-6 text-center mt-4">
              <div className="text-4xl mb-2">📍</div>
              <p className="text-lg font-bold text-primary-800 dark:text-primary-200">
                {dn(nearbyList[0].name, nearbyList[0].nameEn)}
              </p>
              <p className="text-sm text-primary-600 dark:text-primary-400">
                {dn(nearbyList[0].city.name, nearbyList[0].city.nameEn)}
              </p>
            </div>
            <button onClick={handleConfirm} disabled={loading} className="btn-primary flex items-center justify-center gap-2">
              <FiCheck className="w-4 h-4" />
              {loading ? (lang === 'en' ? 'Verifying...' : 'جاري التحقق...') : (lang === 'en' ? 'Yes, verify' : 'نعم، تحقق')}
            </button>
            <button onClick={() => userLat != null && userLng != null && fetchNearby(userLat, userLng, userAccuracy ?? 9999)} className="text-sm text-gray-500 underline mt-3">
              {lang === 'en' ? 'No, different neighborhood' : 'لا، حيّي مختلف'}
            </button>
          </div>
        )}

        {step === 'nearby' && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
              {lang === 'en' ? 'Choose your neighborhood' : 'اختر حيّك'}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {lang === 'en' ? 'Pick from the neighborhoods near your current location.' : 'اختر من الأحياء القريبة من موقعك.'}
            </p>
            <div className="space-y-2 mb-6">
              {nearbyList.map(n => (
                <button
                  key={n.id}
                  onClick={() => setSelectedId(n.id)}
                  className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border-2 transition-all ${
                    selectedId === n.id
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : 'border-gray-100 dark:border-gray-700 text-gray-800 dark:text-white'
                  }`}
                >
                  <span className={`text-xs ${selectedId === n.id ? 'opacity-70' : 'text-gray-400'}`}>
                    {n.distanceKm} {lang === 'en' ? 'km' : 'كم'} · {dn(n.city.name, n.city.nameEn)}
                  </span>
                  <span className="font-medium">{dn(n.name, n.nameEn)}</span>
                </button>
              ))}
            </div>
            <button onClick={handleConfirm} disabled={loading || !selectedId} className="btn-primary flex items-center justify-center gap-2">
              <FiCheck className="w-4 h-4" />
              {loading ? (lang === 'en' ? 'Verifying...' : 'جاري التحقق...') : (lang === 'en' ? 'Verify' : 'تحقق')}
            </button>
          </div>
        )}

        {step === 'denied' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-20 h-20 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
              <FiMapPin className="w-10 h-10 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {lang === 'en' ? 'Location access required' : 'صلاحية الموقع مطلوبة'}
            </h2>
            <p className="text-sm text-gray-500 max-w-xs">
              {lang === 'en' ? 'Enable location in Settings to verify your neighborhood.' : 'فعّل صلاحية الموقع من الإعدادات للتحقق من حيّك.'}
            </p>
            <div className="flex flex-col gap-3 w-full max-w-xs mt-2">
              <button onClick={openSystemSettings} className="btn-primary flex items-center justify-center gap-2">
                <FiSettings className="w-4 h-4" />
                {lang === 'en' ? 'Open Settings' : 'افتح الإعدادات'}
              </button>
              <button onClick={retryAfterSettings} className="w-full flex items-center justify-center gap-2 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold py-3 rounded-xl">
                <FiRefreshCw className="w-4 h-4" />
                {lang === 'en' ? "I've enabled it" : 'فعّلتها'}
              </button>
            </div>
          </div>
        )}

        {step === 'timeout' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
            <FiLoader className="w-10 h-10 text-amber-400" />
            <h2 className="text-xl font-bold">{lang === 'en' ? "Couldn't detect location" : 'تعذّر تحديد الموقع'}</h2>
            <button onClick={start} className="btn-primary mt-4 w-full max-w-xs flex items-center justify-center gap-2">
              <FiRefreshCw className="w-4 h-4" /> {lang === 'en' ? 'Try again' : 'أعد المحاولة'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

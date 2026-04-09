'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiMapPin, FiLoader, FiCheck, FiArrowRight, FiArrowLeft, FiSearch } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { useGPSLocation } from '@/hooks/useGPSLocation'

type Step = 'name' | 'gender' | 'account_type' | 'location'

type LocationStep = 'ask' | 'detecting' | 'confirm' | 'nearby' | 'denied' | 'timeout' | 'low_accuracy' | 'manual'

interface DetectedNeighborhood {
  id: string
  name: string
  nameEn: string
  distanceKm: number
  confidence: 'high' | 'medium' | 'low'
  city: { id: string; name: string; nameEn: string }
}

export default function OnboardingPage() {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const dn = (ar: string, en: string) => (lang === 'en' && en) ? en : ar
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')
  const [lastName, setLastName] = useState('')
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'UNSPECIFIED'>('MALE')
  const [accountType, setAccountType] = useState<'NORMAL' | 'SERVICE_PROVIDER'>('NORMAL')

  // Location state — starts at 'ask', NOT 'detecting'
  const [locationStep, setLocationStep] = useState<LocationStep>('ask')
  const [detectedNeighborhood, setDetectedNeighborhood] = useState<DetectedNeighborhood | null>(null)
  const [selectedNeighborhoodId, setSelectedNeighborhoodId] = useState('')
  const [loading, setLoading] = useState(false)
  const [lowAccuracyRetries, setLowAccuracyRetries] = useState(0)
  const [nearbyList, setNearbyList] = useState<{ id: string; name: string; nameEn: string; distanceKm: number; city: { name: string; nameEn: string } }[]>([])
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const [manualSearch, setManualSearch] = useState('')
  const [allNeighborhoods, setAllNeighborhoods] = useState<{ id: string; name: string; nameEn: string; city: { name: string; nameEn: string } }[]>([])
  const [loadingNeighborhoods, setLoadingNeighborhoods] = useState(false)

  const gps = useGPSLocation()

  const BackBtn = ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} className="flex items-center gap-1 text-gray-400 text-sm mb-4 self-start">
      {lang !== 'en' ? <FiArrowRight className="w-4 h-4" /> : <FiArrowLeft className="w-4 h-4" />}
      {t('common_back')}
    </button>
  )

  // Direct browser geolocation as ultimate fallback
  function tryDirectGeolocation() {
    console.log('[ONBOARD-LOCATION] Trying direct navigator.geolocation...')
    if (!navigator.geolocation) {
      console.log('[ONBOARD-LOCATION] navigator.geolocation not available')
      setLocationStep('denied')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log('[ONBOARD-LOCATION] Direct geolocation SUCCESS:', pos.coords.latitude, pos.coords.longitude)
        resolveNeighborhood(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, false)
      },
      (err) => {
        console.log('[ONBOARD-LOCATION] Direct geolocation FAILED:', err.code, err.message)
        if (err.code === 1) setLocationStep('denied')
        else setLocationStep('timeout')
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 },
    )
  }

  // Called ONLY by explicit user button tap — never by useEffect or mount
  function requestLocation() {
    setLocationStep('detecting')
    setDetectedNeighborhood(null)
    setSelectedNeighborhoodId('')
    gps.startCollecting()
  }

  // Single effect: react when GPS finishes collecting
  useEffect(() => {
    if (gps.collecting) return
    if (locationStep !== 'detecting') return

    const { result, error } = gps

    console.log('[ONBOARD-LOCATION]', {
      error,
      hasResult: !!result,
      accuracy: result?.accuracy,
      confidence: result?.confidence,
      lowAccuracyRetries,
    })

    // denied / unavailable → denied screen
    if (error === 'denied' || error === 'unavailable') {
      // Last resort: try direct browser geolocation — this triggers the iOS permission dialog
      console.log('[ONBOARD-LOCATION] Hook failed with', error, '— trying direct geolocation fallback')
      tryDirectGeolocation()
      return
    }

    // timeout with no result → try direct fallback
    if (error === 'timeout' || (!result && !error)) {
      console.log('[ONBOARD-LOCATION] Hook timed out — trying direct geolocation fallback')
      tryDirectGeolocation()
      return
    }

    // low_accuracy error from hook — but we still have a sample
    if (error === 'low_accuracy' && result) {
      if (lowAccuracyRetries >= 1) {
        console.log('[ONBOARD-LOCATION] Low-accuracy escape: resolving after', lowAccuracyRetries + 1, 'attempts')
        resolveNeighborhood(result.lat, result.lng, result.accuracy, true)
      } else {
        setLowAccuracyRetries(prev => prev + 1)
        setLocationStep('low_accuracy')
      }
      return
    }

    // We have a usable result (high or medium confidence) → resolve
    if (result) {
      resolveNeighborhood(result.lat, result.lng, result.accuracy, false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps.collecting])

  async function resolveNeighborhood(lat: number, lng: number, accuracy: number, forceConfirm: boolean) {
    setUserLat(lat)
    setUserLng(lng)
    try {
      const res = await fetch(`/api/neighborhoods/detect?lat=${lat}&lng=${lng}&accuracy=${accuracy}`)
      if (!res.ok) { setLocationStep('timeout'); return }
      const data = await res.json()

      setDetectedNeighborhood(data)
      setSelectedNeighborhoodId(data.id)

      if (data.confidence === 'low' && !forceConfirm) {
        setLocationStep('low_accuracy')
      } else {
        setLocationStep('confirm')
      }
    } catch {
      setLocationStep('timeout')
    }
  }

  async function showNearby() {
    if (!userLat || !userLng) return
    try {
      const res = await fetch(`/api/neighborhoods/detect?lat=${userLat}&lng=${userLng}&nearby=true`)
      const data = await res.json()
      // Filter to 4km and exclude the already-detected one
      const filtered = (Array.isArray(data) ? data : [])
        .filter((n: any) => n.distanceKm <= 4 && n.id !== detectedNeighborhood?.id)
      setNearbyList(filtered)
      setLocationStep('nearby')
    } catch {
      // stay on confirm
    }
  }

  async function handleFinish() {
    if (!selectedNeighborhoodId) {
      toast.error(lang !== 'en' ? 'لم يتم تحديد الحي' : 'Neighborhood not detected')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/complete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, lastName, gender, accountType, neighborhoodId: selectedNeighborhoodId }),
      })
      if (!res.ok) { toast.error(t('onboard_error')); return }
      // Reset tour so it starts automatically on first feed visit
      try {
        localStorage.removeItem('hai_tour_seen')
        localStorage.removeItem('hai_tour_ride_create')
        localStorage.removeItem('hai_tour_ride_detail')
        localStorage.removeItem('hai_tour_post_create')
        localStorage.removeItem('hai_tour_chat')
        localStorage.removeItem('hai_splash')
      } catch {}
      router.push('/feed')
    } catch {
      toast.error(t('auth_connection_err'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-[100dvh] flex flex-col px-6 pt-6 bg-white dark:bg-gray-900">
      {/* Progress */}
      <div className="flex gap-2 mb-5">
        {(['name', 'gender', 'account_type', 'location'] as Step[]).map((s, i) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-all ${
              ['name', 'gender', 'account_type', 'location'].indexOf(step) >= i ? 'bg-primary-600' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      {/* Step: Name */}
      {step === 'name' && (
        <div className="flex-1 flex flex-col">
          <BackBtn onClick={() => router.push('/')} />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{t('onboard_hello')}</h1>
          <p className="text-gray-500 text-sm mb-8">{t('onboard_your_name')}</p>
          <input
            type="text"
            placeholder={t('onboard_first_name')}
            value={name}
            onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\s]/g, ''))}
            className="input-field mb-3"
            autoFocus
            maxLength={50}
          />
          <input
            type="text"
            placeholder={t('onboard_last_name')}
            value={lastName}
            onChange={(e) => setLastName(e.target.value.replace(/[^a-zA-Z\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\s]/g, ''))}
            className="input-field mb-4"
            maxLength={50}
          />
          <button
            onClick={() => { if (!name.trim()) { toast.error(t('onboard_name_required')); return } setStep('gender') }}
            className="btn-primary"
          >
            {t('onboard_next')}
          </button>
        </div>
      )}

      {/* Step: Gender */}
      {step === 'gender' && (
        <div className="flex-1 flex flex-col">
          <BackBtn onClick={() => setStep('name')} />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{t('onboard_gender')}</h1>
          <p className="text-gray-500 text-sm mb-8">{t('onboard_gender_subtitle')}</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { value: 'MALE',   label: t('onboard_male'),   icon: '👨' },
              { value: 'FEMALE', label: t('onboard_female'), icon: '👩' },
            ].map((g) => (
              <button
                key={g.value}
                onClick={() => setGender(g.value as 'MALE' | 'FEMALE' | 'UNSPECIFIED')}
                className={`p-4 rounded-2xl border-2 text-center transition-all ${
                  gender === g.value ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white'
                }`}
              >
                <div className="text-3xl mb-1">{g.icon}</div>
                <div className="font-medium">{g.label}</div>
              </button>
            ))}
          </div>
          <button
            onClick={() => setGender('UNSPECIFIED')}
            className={`w-full text-center py-2.5 mb-6 rounded-xl text-sm font-medium transition-all ${
              gender === 'UNSPECIFIED' ? 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white' : 'text-gray-400'
            }`}
          >
            {lang === 'en' ? 'Prefer not to say' : lang === 'ur' ? 'بتانا نہیں چاہتا' : 'أفضل عدم التحديد'}
          </button>
          <button
            onClick={() => setStep('account_type')}
            className="btn-primary"
          >
            {t('onboard_next')}
          </button>
        </div>
      )}

      {/* Step: Account Type */}
      {step === 'account_type' && (
        <div className="flex-1 flex flex-col">
          <BackBtn onClick={() => setStep('gender')} />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            {lang !== 'en' ? 'نوع الحساب' : 'Account Type'}
          </h1>
          <p className="text-gray-500 text-sm mb-8">
            {lang !== 'en' ? 'هل تقدم خدمة في الحي؟' : 'Do you offer a service in the neighborhood?'}
          </p>
          <div className="space-y-3 mb-8">
            <button
              onClick={() => setAccountType('NORMAL')}
              className={`w-full p-4 rounded-2xl border-2 text-right transition-all ${
                accountType === 'NORMAL' ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white'
              }`}
            >
              <div className="text-lg mb-1">👤</div>
              <div className="font-medium">{lang !== 'en' ? 'مستخدم عادي' : 'Regular User'}</div>
              <p className={`text-xs mt-1 ${accountType === 'NORMAL' ? 'text-primary-100' : 'text-gray-400'}`}>
                {lang !== 'en' ? 'أبحث عن خدمات وأتواصل مع جيراني' : 'Looking for services and connecting with neighbors'}
              </p>
            </button>
            <button
              onClick={() => setAccountType('SERVICE_PROVIDER')}
              className={`w-full p-4 rounded-2xl border-2 text-right transition-all ${
                accountType === 'SERVICE_PROVIDER' ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white'
              }`}
            >
              <div className="text-lg mb-1">🛠</div>
              <div className="font-medium">{lang !== 'en' ? 'مقدم خدمة' : 'Service Provider'}</div>
              <p className={`text-xs mt-1 ${accountType === 'SERVICE_PROVIDER' ? 'text-primary-100' : 'text-gray-400'}`}>
                {lang !== 'en' ? 'أقدم خدمة (سباك، كهربائي، توصيل...)' : 'I offer a service (plumber, electrician, delivery...)'}
              </p>
            </button>
          </div>
          <button
            onClick={() => setStep('location')}
            className="btn-primary"
          >
            {t('onboard_next')}
          </button>
        </div>
      )}

      {/* Step: Location */}
      {step === 'location' && (
        <div className="flex-1 flex flex-col">

          {/* A. Initial: ask user to share location — NO auto-request */}
          {locationStep === 'ask' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
              <div className="w-20 h-20 rounded-full bg-primary-50 flex items-center justify-center">
                <FiMapPin className="w-10 h-10 text-primary-600" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {lang !== 'en' ? 'تحديد حيّك' : 'Detect your neighborhood'}
              </h1>
              <p className="text-gray-500 text-sm max-w-xs">
                {lang === 'ar'
                  ? 'نحتاج موقعك لتحديد الحي المناسب'
                  : 'We need your location to find your neighborhood'}
              </p>
              <button
                onClick={requestLocation}
                className="btn-primary mt-4 w-full max-w-xs flex items-center justify-center gap-2"
              >
                <FiMapPin className="w-4 h-4" />
                {lang !== 'en' ? 'استخدم موقعي' : 'Use my location'}
              </button>
              <button
                onClick={() => setStep('gender')}
                className="text-sm text-gray-400 underline mt-2"
              >
                {t('common_back')}
              </button>
            </div>
          )}

          {/* B. Detecting — spinner while collecting GPS samples */}
          {locationStep === 'detecting' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
              <div className="w-20 h-20 rounded-full bg-primary-50 flex items-center justify-center">
                <FiMapPin className="w-10 h-10 text-primary-600 animate-pulse" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {lang !== 'en' ? 'جاري تحديد موقعك...' : 'Detecting your location...'}
              </h1>
              <div className="flex items-center gap-2 text-primary-600 text-sm">
                <FiLoader className="w-4 h-4 animate-spin" />
                <span>
                  {lang === 'en' ? 'Please allow location access' : lang === 'ur' ? 'براہ کرم مقام کی اجازت دیں' : 'يرجى السماح بالوصول للموقع'}
                </span>
              </div>
              {gps.sampleCount > 0 && (
                <p className="text-xs text-gray-400">
                  {gps.sampleCount}/3
                </p>
              )}
            </div>
          )}

          {/* C. Success — confirm detected neighborhood */}
          {locationStep === 'confirm' && detectedNeighborhood && (
            <div className="flex-1 flex flex-col">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {lang !== 'en' ? 'تم تحديد موقعك' : 'Location detected'}
              </h1>
              <p className="text-gray-500 text-sm mb-8">
                {lang !== 'en' ? 'هل هذا حيّك الصحيح؟' : 'Is this your neighborhood?'}
              </p>

              <div className="bg-primary-50 border-2 border-primary-200 rounded-2xl p-5 mb-6 text-center">
                <div className="text-4xl mb-2">📍</div>
                <p className="text-lg font-bold text-primary-800">
                  {dn(detectedNeighborhood.name, detectedNeighborhood.nameEn)}
                </p>
                <p className="text-sm text-primary-600">
                  {dn(detectedNeighborhood.city.name, detectedNeighborhood.city.nameEn)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {detectedNeighborhood.distanceKm} {lang !== 'en' ? 'كم' : 'km'}
                </p>
                <p className={`text-xs mt-2 font-medium ${
                  detectedNeighborhood.confidence === 'high' ? 'text-green-600' : 'text-amber-500'
                }`}>
                  {detectedNeighborhood.confidence === 'high'
                    ? (lang !== 'en' ? 'دقة عالية ✓' : 'High accuracy ✓')
                    : (lang !== 'en' ? 'دقة متوسطة' : 'Medium accuracy')}
                </p>
              </div>

              <button
                onClick={handleFinish}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-50 mb-3"
              >
                <FiCheck className="w-5 h-5" />
                {lang !== 'en' ? 'نعم، هذا حيّي' : 'Yes, this is my neighborhood'}
              </button>
              <button
                onClick={showNearby}
                className="w-full text-sm text-gray-500 underline"
              >
                {lang !== 'en' ? 'لا، حيّي مختلف' : 'No, my neighborhood is different'}
              </button>
            </div>
          )}

          {/* Nearby picker — only reachable from confirm "not my neighborhood" */}
          {locationStep === 'nearby' && (
            <div className="flex-1 flex flex-col">
              <BackBtn onClick={() => {
                if (detectedNeighborhood) {
                  setSelectedNeighborhoodId(detectedNeighborhood.id)
                  setLocationStep('confirm')
                } else {
                  setLocationStep('ask')
                }
              }} />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {lang !== 'en' ? 'اختر حيّك' : 'Choose your neighborhood'}
              </h1>
              <p className="text-gray-500 text-sm mb-4">
                {lang !== 'en' ? 'الأحياء القريبة من موقعك' : 'Neighborhoods near your location'}
              </p>

              {nearbyList.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-4xl mb-2">😕</p>
                  <p className="text-sm">
                    {lang !== 'en' ? 'لا توجد أحياء أخرى قريبة' : 'No other neighborhoods nearby'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 mb-6 flex-1 overflow-y-auto">
                  {nearbyList.map(n => (
                    <button
                      key={n.id}
                      onClick={() => { setSelectedNeighborhoodId(n.id); setDetectedNeighborhood({ ...n, confidence: 'medium' } as any) }}
                      className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border-2 transition-all ${
                        selectedNeighborhoodId === n.id
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 text-gray-800 dark:text-white'
                      }`}
                    >
                      <span className={`text-xs ${selectedNeighborhoodId === n.id ? 'opacity-70' : 'text-gray-400'}`}>
                        {n.distanceKm} {lang !== 'en' ? 'كم' : 'km'} · {dn(n.city.name, n.city.nameEn)}
                      </span>
                      <span className="font-medium">{dn(n.name, n.nameEn)}</span>
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={handleFinish}
                disabled={loading || !selectedNeighborhoodId}
                className="btn-primary"
              >
                {loading
                  ? (lang !== 'en' ? 'جاري الحفظ...' : 'Saving...')
                  : (lang !== 'en' ? 'تأكيد الحي' : 'Confirm neighborhood')}
              </button>
            </div>
          )}

          {/* D. Denied — permission was explicitly denied */}
          {locationStep === 'denied' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
              <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center">
                <FiMapPin className="w-10 h-10 text-red-400" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {lang !== 'en' ? 'تم رفض صلاحية الموقع' : 'Location permission denied'}
              </h1>
              <p className="text-gray-500 text-sm max-w-xs">
                {lang === 'ar'
                  ? 'يرجى تفعيل الموقع للحصول على تجربة أفضل'
                  : 'Please enable location for a better experience'}
              </p>
              <button
                onClick={requestLocation}
                className="btn-primary mt-4 w-full max-w-xs"
              >
                {lang !== 'en' ? 'أعد المحاولة' : 'Try Again'}
              </button>
              <button onClick={() => {
                setLocationStep('manual')
                if (allNeighborhoods.length === 0 && !loadingNeighborhoods) {
                  setLoadingNeighborhoods(true)
                  fetch('/api/neighborhoods/all').then(r => r.json()).then(d => setAllNeighborhoods(d || [])).catch(() => {}).finally(() => setLoadingNeighborhoods(false))
                }
              }} className="text-sm text-primary-600 font-medium mt-2">
                {lang !== 'en' ? 'اختر الحي يدويًا' : 'Choose neighborhood manually'}
              </button>
            </div>
          )}

          {/* E. Timeout — location request failed, NOT permission denied */}
          {locationStep === 'timeout' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
              <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center">
                <FiLoader className="w-10 h-10 text-amber-400" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {lang !== 'en' ? 'تعذر تحديد موقعك' : 'Could not detect location'}
              </h1>
              <p className="text-gray-500 text-sm max-w-xs">
                {lang === 'ar'
                  ? 'تعذر تحديد موقعك الآن. حاول مرة أخرى'
                  : 'Could not determine your location right now. Please try again'}
              </p>
              <button
                onClick={requestLocation}
                className="btn-primary mt-4 w-full max-w-xs"
              >
                {lang !== 'en' ? 'أعد المحاولة' : 'Try Again'}
              </button>
              <button onClick={() => {
                setLocationStep('manual')
                if (allNeighborhoods.length === 0 && !loadingNeighborhoods) {
                  setLoadingNeighborhoods(true)
                  fetch('/api/neighborhoods/all').then(r => r.json()).then(d => setAllNeighborhoods(d || [])).catch(() => {}).finally(() => setLoadingNeighborhoods(false))
                }
              }} className="text-sm text-primary-600 font-medium mt-2">
                {lang !== 'en' ? 'اختر الحي يدويًا' : 'Choose neighborhood manually'}
              </button>
            </div>
          )}

          {/* E2. Manual neighborhood selection */}
          {locationStep === 'manual' && (
            <div className="flex-1 flex flex-col">
              <BackBtn onClick={() => setLocationStep('ask')} />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {lang !== 'en' ? 'اختر حيّك' : 'Choose your neighborhood'}
              </h1>
              <p className="text-gray-500 text-sm mb-4">
                {lang !== 'en' ? 'ابحث عن حيّك وحدده' : 'Search and select your neighborhood'}
              </p>
              <div className="relative mb-4">
                <FiSearch className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={manualSearch}
                  onChange={e => setManualSearch(e.target.value)}
                  placeholder={lang !== 'en' ? 'ابحث عن حي...' : 'Search neighborhood...'}
                  className="input-field pr-10"
                />
              </div>
              {loadingNeighborhoods ? (
                <div className="flex-1 flex items-center justify-center">
                  <FiLoader className="w-6 h-6 text-primary-600 animate-spin" />
                </div>
              ) : (
                <div className="space-y-2 mb-6 flex-1 overflow-y-auto">
                  {allNeighborhoods
                    .filter(n => !manualSearch || n.name.includes(manualSearch) || n.nameEn.toLowerCase().includes(manualSearch.toLowerCase()) || n.city.name.includes(manualSearch) || n.city.nameEn.toLowerCase().includes(manualSearch.toLowerCase()))
                    .slice(0, 30)
                    .map(n => (
                      <button
                        key={n.id}
                        onClick={() => { setSelectedNeighborhoodId(n.id); setDetectedNeighborhood({ id: n.id, name: n.name, nameEn: n.nameEn, distanceKm: 0, confidence: 'high', city: { id: '', name: n.city.name, nameEn: n.city.nameEn } }) }}
                        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border-2 transition-all ${
                          selectedNeighborhoodId === n.id
                            ? 'border-primary-600 bg-primary-600 text-white'
                            : 'border-gray-100 dark:border-gray-700 text-gray-800 dark:text-white'
                        }`}
                      >
                        <span className={`text-xs ${selectedNeighborhoodId === n.id ? 'opacity-70' : 'text-gray-400'}`}>
                          {dn(n.city.name, n.city.nameEn)}
                        </span>
                        <span className="font-medium">{dn(n.name, n.nameEn)}</span>
                      </button>
                    ))}
                </div>
              )}
              <button
                onClick={handleFinish}
                disabled={loading || !selectedNeighborhoodId}
                className="btn-primary"
              >
                {loading
                  ? (lang !== 'en' ? 'جاري الحفظ...' : 'Saving...')
                  : (lang !== 'en' ? 'تأكيد الحي' : 'Confirm neighborhood')}
              </button>
            </div>
          )}

          {/* F. Low accuracy — got a reading but not precise enough */}
          {locationStep === 'low_accuracy' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
              <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center">
                <FiMapPin className="w-10 h-10 text-amber-400" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {lang !== 'en' ? 'دقة الموقع منخفضة' : 'Low location accuracy'}
              </h1>
              <p className="text-gray-500 text-sm max-w-xs">
                {lang === 'ar'
                  ? 'تم العثور على موقع تقريبي فقط. حاول مرة أخرى للحصول على دقة أعلى'
                  : 'Only an approximate location was found. Try again for better accuracy'}
              </p>
              <button
                onClick={requestLocation}
                className="btn-primary mt-4 w-full max-w-xs"
              >
                {lang !== 'en' ? 'أعد المحاولة' : 'Try Again'}
              </button>
              <button onClick={() => setStep('gender')} className="text-sm text-gray-400 underline mt-2">
                {t('common_back')}
              </button>
            </div>
          )}

        </div>
      )}
    </main>
  )
}

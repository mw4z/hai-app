'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiMapPin, FiLoader, FiCheck, FiArrowRight, FiArrowLeft, FiRefreshCw, FiSettings, FiSearch } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { useGPSLocation } from '@/hooks/useGPSLocation'
import { tryRedeemPendingInvite } from '@/lib/pendingInvite'

type Step = 'name' | 'gender' | 'account_type' | 'location'

// Simplified location states:
//   ask            → user hasn't shared location yet (initial prompt)
//   detecting      → GPS is running
//   confirm        → precise match found, ask user to confirm
//   nearby         → either low-accuracy fallback OR user said "not my neighborhood" —
//                    show the short nearby list derived from the captured coordinates
//   denied         → permission explicitly denied; retry only
//   timeout        → location request failed with no sample at all; retry only
type LocationStep =
  | 'ask'
  | 'detecting'
  | 'confirm'
  | 'nearby'
  | 'denied'
  | 'timeout'
  | 'manual'

interface DetectedNeighborhood {
  id: string
  name: string
  nameEn: string
  distanceKm: number
  confidence: 'high' | 'medium' | 'low'
  city: { id: string; name: string; nameEn: string }
}

interface NearbyNeighborhood {
  id: string
  name: string
  nameEn: string
  distanceKm: number
  city: { name: string; nameEn: string }
}

// Must match src/lib/location/verify.ts
const NEARBY_MAX_RESULTS = 4

export default function OnboardingPage() {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const dn = (ar: string, en: string) => (lang === 'en' && en) ? en : ar
  const [step, setStep] = useState<Step>('name')
  const [name, setName] = useState('')
  const [lastName, setLastName] = useState('')
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'UNSPECIFIED'>('MALE')
  const [accountType, setAccountType] = useState<'NORMAL' | 'SERVICE_PROVIDER'>('NORMAL')

  const [locationStep, setLocationStep] = useState<LocationStep>('ask')
  const [detectedNeighborhood, setDetectedNeighborhood] = useState<DetectedNeighborhood | null>(null)
  const [selectedNeighborhoodId, setSelectedNeighborhoodId] = useState('')
  const [loading, setLoading] = useState(false)
  const [nearbyList, setNearbyList] = useState<NearbyNeighborhood[]>([])
  const [nearbyLoading, setNearbyLoading] = useState(false)
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const [userAccuracy, setUserAccuracy] = useState<number | null>(null)
  const [allNeighborhoods, setAllNeighborhoods] = useState<Array<{ id: string; name: string; nameEn: string; cityName: string; cityNameEn: string }>>([])
  const [manualSearch, setManualSearch] = useState('')
  const [manualLoading, setManualLoading] = useState(false)

  const gps = useGPSLocation()

  const BackBtn = ({ onClick }: { onClick: () => void }) => (
    <button onClick={onClick} className="flex items-center gap-1 text-gray-400 text-sm mb-4 self-start">
      {lang !== 'en' ? <FiArrowRight className="w-4 h-4" /> : <FiArrowLeft className="w-4 h-4" />}
      {t('common_back')}
    </button>
  )

  function isNativePlatform(): boolean {
    return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()
  }

  async function openSystemSettings() {
    if (isNativePlatform()) {
      const platform = (window as any).Capacitor?.getPlatform?.() || 'unknown'
      if (platform === 'ios') {
        try { window.location.href = 'app-settings:'; return } catch { /* fall through */ }
      }
      toast(
        lang === 'en'
          ? 'Open device Settings → Apps → Hai → Permissions → Location → Allow'
          : lang === 'ur'
            ? 'سیٹنگز → ایپس → Hai → اجازتیں → مقام → اجازت دیں'
            : 'افتح الإعدادات → التطبيقات → حي → الصلاحيات → الموقع → سماح',
        { duration: 6000 },
      )
      return
    }
    toast(
      lang === 'en'
        ? 'Click the lock icon next to the URL and enable location'
        : 'اضغط على أيقونة القفل بجانب الرابط وفعّل الموقع',
      { duration: 6000 },
    )
  }

  // Smart retry: check permission status BEFORE attempting location.
  // If still denied, stay on the denied screen — don't loop.
  async function retryAfterSettings() {
    if (isNativePlatform()) {
      try {
        const { Geolocation } = await import('@capacitor/geolocation')
        const status = await Geolocation.checkPermissions()
        if (status.location === 'denied') {
          toast.error(
            lang === 'en'
              ? 'Location is still disabled. Please enable it in Settings first.'
              : lang === 'ur'
                ? 'مقام ابھی بھی غیر فعال ہے — پہلے سیٹنگز سے فعال کریں'
                : 'الموقع لا يزال معطلاً — فعّله من الإعدادات أولاً',
          )
          return
        }
      } catch { /* fall through to requestLocation */ }
    }
    requestLocation()
  }

  async function enterManualPicker() {
    setManualLoading(true)
    setLocationStep('manual')
    setUserLat(null)
    setUserLng(null)
    setUserAccuracy(null)
    try {
      const res = await fetch('/api/neighborhoods/all')
      const data = await res.json()
      setAllNeighborhoods(
        (Array.isArray(data) ? data : []).map((n: any) => ({
          id: n.id,
          name: n.name,
          nameEn: n.nameEn,
          cityName: n.cityName || n.city?.name || '',
          cityNameEn: n.cityNameEn || n.city?.nameEn || '',
        })),
      )
    } catch {
      setAllNeighborhoods([])
    } finally {
      setManualLoading(false)
    }
  }

  // Ultimate fallback: plain browser geolocation, low accuracy allowed
  function tryDirectGeolocation() {
    console.log('[ONBOARD-LOCATION] Trying direct navigator.geolocation...')
    if (!navigator.geolocation) {
      setLocationStep('timeout')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log('[ONBOARD-LOCATION] Direct geolocation SUCCESS:', pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy)
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

  function requestLocation() {
    setLocationStep('detecting')
    setDetectedNeighborhood(null)
    setSelectedNeighborhoodId('')
    setNearbyList([])
    gps.startCollecting()
  }

  useEffect(() => {
    if (gps.collecting) return
    if (locationStep !== 'detecting') return

    const { result, error } = gps

    console.log('[ONBOARD-LOCATION]', {
      error,
      hasResult: !!result,
      accuracy: result?.accuracy,
      confidence: result?.confidence,
    })

    // denied / unavailable → try direct browser fallback once to trigger permission dialog
    if (error === 'denied' || error === 'unavailable') {
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

    // Low accuracy: still have a usable coordinate for the fallback nearby list
    if (error === 'low_accuracy' && result) {
      console.log('[ONBOARD-LOCATION] Low-accuracy sample — fetching nearby list from', result.lat, result.lng)
      fetchNearbyAndShowPicker(result.lat, result.lng, result.accuracy)
      return
    }

    // We have a usable result (high or medium confidence) → resolve precisely
    if (result) {
      resolveNeighborhood(result.lat, result.lng, result.accuracy, false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps.collecting])

  async function resolveNeighborhood(lat: number, lng: number, accuracy: number, forceConfirm: boolean) {
    setUserLat(lat)
    setUserLng(lng)
    setUserAccuracy(accuracy)
    try {
      const res = await fetch(`/api/neighborhoods/detect?lat=${lat}&lng=${lng}&accuracy=${accuracy}`)
      if (!res.ok) {
        // Detection itself failed — fall back to nearby picker so the user still has a path
        await fetchNearbyAndShowPicker(lat, lng, accuracy)
        return
      }
      const data = await res.json()

      // If the server only managed a low-confidence match, skip straight to
      // the nearby picker so the user never sees a confusing "we think…" card
      if (data.confidence === 'low' && !forceConfirm) {
        await fetchNearbyAndShowPicker(lat, lng, accuracy)
        return
      }

      setDetectedNeighborhood(data)
      setSelectedNeighborhoodId(data.id)
      setLocationStep('confirm')
    } catch {
      await fetchNearbyAndShowPicker(lat, lng, accuracy)
    }
  }

  /**
   * Fetch the short nearby list for a given fallback location and render
   * the nearby picker. This is the key fix for the Apple dead-end: even
   * when precise resolution fails, the user always has a real next step.
   */
  async function fetchNearbyAndShowPicker(lat: number, lng: number, accuracy: number) {
    setUserLat(lat)
    setUserLng(lng)
    setUserAccuracy(accuracy)
    setNearbyLoading(true)
    setLocationStep('nearby')
    try {
      const res = await fetch(`/api/neighborhoods/detect?lat=${lat}&lng=${lng}&nearby=true`)
      const data = await res.json()
      const list: NearbyNeighborhood[] = (Array.isArray(data) ? data : []).slice(
        0,
        NEARBY_MAX_RESULTS,
      )
      setNearbyList(list)
      // Pre-select the closest so the CTA is always enabled when anything is offered
      if (list.length > 0) {
        setSelectedNeighborhoodId(list[0].id)
        setDetectedNeighborhood({
          id: list[0].id,
          name: list[0].name,
          nameEn: list[0].nameEn,
          distanceKm: list[0].distanceKm,
          confidence: 'low',
          city: { id: '', name: list[0].city.name, nameEn: list[0].city.nameEn },
        })
      }
    } catch {
      setNearbyList([])
    } finally {
      setNearbyLoading(false)
    }
  }

  async function handleFinish() {
    if (!selectedNeighborhoodId) {
      toast.error(lang !== 'en' ? 'لم يتم تحديد الحي' : 'Neighborhood not selected')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/complete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          lastName,
          gender,
          accountType,
          neighborhoodId: selectedNeighborhoodId,
          verifyLat: userLat,
          verifyLng: userLng,
          verifyAccuracy: userAccuracy,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.error === 'neighborhood_mismatch') {
          toast.error(
            lang === 'en'
              ? "This neighborhood doesn't match your location"
              : 'هذا الحي لا يتطابق مع موقعك',
          )
          return
        }
        toast.error(t('onboard_error'))
        return
      }
      try {
        localStorage.removeItem('hai_tour_seen')
        localStorage.removeItem('hai_tour_ride_create')
        localStorage.removeItem('hai_tour_ride_detail')
        localStorage.removeItem('hai_tour_post_create')
        localStorage.removeItem('hai_tour_chat')
        localStorage.removeItem('hai_splash')
      } catch {}

      try { window.dispatchEvent(new CustomEvent('hai:auth-ready')) } catch {}

      tryRedeemPendingInvite()
        .then((result) => {
          if (result.status === 'success') {
            const msg = result.inviterName
              ? lang === 'en'
                ? `Thanks for joining via ${result.inviterName}`
                : `شكراً لانضمامك عبر ${result.inviterName}`
              : lang === 'en'
                ? 'Invite linked successfully'
                : 'تم ربط الدعوة بنجاح'
            toast.success(msg, { duration: 3500 })
          }
        })
        .catch(() => { /* silent */ })

      router.push('/tutorial')
    } catch {
      toast.error(t('auth_connection_err'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex flex-col px-6 pt-6 bg-white dark:bg-gray-900" style={{ minHeight: 'calc(100dvh - env(safe-area-inset-top, 0px))' }}>
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
              className={`w-full p-4 rounded-2xl border-2 text-start transition-all ${
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
              className={`w-full p-4 rounded-2xl border-2 text-start transition-all ${
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

          {/* A. Initial: ask user to share location */}
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

          {/* C. Precise match — confirm detected neighborhood */}
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
                onClick={() => {
                  if (userLat != null && userLng != null) {
                    fetchNearbyAndShowPicker(userLat, userLng, userAccuracy ?? 9999)
                  }
                }}
                className="w-full text-sm text-gray-500 underline"
              >
                {lang !== 'en' ? 'لا، حيّي مختلف' : 'No, my neighborhood is different'}
              </button>
            </div>
          )}

          {/* D. Nearby picker — used for:
              - low-accuracy GPS (automatic)
              - user rejected the precise match (manual)
              - detect endpoint error (fallback)
              Always derived from the captured fallback coordinates — server
              re-validates the selection against those same coordinates. */}
          {locationStep === 'nearby' && (
            <div className="flex-1 flex flex-col">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {lang !== 'en' ? 'اختر حيّك' : 'Choose your neighborhood'}
              </h1>
              <p className="text-gray-500 text-sm mb-4">
                {lang === 'en'
                  ? 'We couldn\'t pinpoint you exactly. Pick from the neighborhoods near your current location.'
                  : 'تعذّر تحديد موقعك بدقة. اختر من الأحياء القريبة من موقعك الحالي.'}
              </p>

              {nearbyLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <FiLoader className="w-6 h-6 text-primary-600 animate-spin" />
                </div>
              ) : nearbyList.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center text-gray-500">
                  <div className="text-4xl">😕</div>
                  <p className="text-sm max-w-xs">
                    {lang === 'en'
                      ? "We couldn't find neighborhoods near your location. Please try again."
                      : 'لم نتمكن من العثور على أحياء قريبة. يرجى المحاولة مرة أخرى.'}
                  </p>
                  <button
                    onClick={requestLocation}
                    className="btn-primary mt-3 flex items-center justify-center gap-2"
                  >
                    <FiRefreshCw className="w-4 h-4" />
                    {lang !== 'en' ? 'إعادة تحديد الموقع' : 'Retry location'}
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-2 mb-6 flex-1 overflow-y-auto overscroll-contain">
                    {nearbyList.map(n => (
                      <button
                        key={n.id}
                        onClick={() => {
                          setSelectedNeighborhoodId(n.id)
                          setDetectedNeighborhood({
                            id: n.id,
                            name: n.name,
                            nameEn: n.nameEn,
                            distanceKm: n.distanceKm,
                            confidence: 'low',
                            city: { id: '', name: n.city.name, nameEn: n.city.nameEn },
                          })
                        }}
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
                  <button
                    onClick={handleFinish}
                    disabled={loading || !selectedNeighborhoodId}
                    className="btn-primary flex items-center justify-center gap-2"
                  >
                    <FiCheck className="w-4 h-4" />
                    {loading
                      ? (lang !== 'en' ? 'جاري الحفظ...' : 'Saving...')
                      : (lang !== 'en' ? 'تأكيد الحي' : 'Confirm neighborhood')}
                  </button>
                  <button
                    onClick={requestLocation}
                    className="w-full text-sm text-gray-500 underline mt-3 flex items-center justify-center gap-1.5"
                  >
                    <FiRefreshCw className="w-3 h-3" />
                    {lang !== 'en' ? 'إعادة تحديد الموقع' : 'Retry location'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* E. Permission denied — dedicated recovery screen.
              iOS will NOT re-show the permission dialog after denial.
              The user MUST go to Settings to re-enable, then come back. */}
          {locationStep === 'denied' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
              <div className="w-20 h-20 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                <FiMapPin className="w-10 h-10 text-red-400" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {lang === 'en' ? 'Location access is required' : lang === 'ur' ? 'مقام کی اجازت ضروری ہے' : 'صلاحية الموقع مطلوبة'}
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs leading-relaxed">
                {lang === 'en'
                  ? 'We need your location to verify your neighborhood. Please enable location access in Settings to continue.'
                  : lang === 'ur'
                    ? 'آپ کے محلے کی تصدیق کیلئے مقام ضروری ہے۔ سیٹنگز سے مقام فعال کریں۔'
                    : 'نحتاج موقعك للتحقق من حيّك. فعّل صلاحية الموقع من الإعدادات للمتابعة.'}
              </p>
              <div className="flex flex-col gap-3 w-full max-w-xs mt-2">
                <button
                  onClick={openSystemSettings}
                  className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-3 rounded-xl active:scale-95 transition-transform"
                >
                  <FiSettings className="w-4 h-4" />
                  {lang === 'en' ? 'Open Settings' : lang === 'ur' ? 'سیٹنگز کھولیں' : 'افتح الإعدادات'}
                </button>
                <button
                  onClick={retryAfterSettings}
                  className="w-full flex items-center justify-center gap-2 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold py-3 rounded-xl active:scale-95 transition-transform"
                >
                  <FiRefreshCw className="w-4 h-4" />
                  {lang === 'en' ? "I've enabled it, try again" : lang === 'ur' ? 'فعال کر دیا، دوبارہ کوشش کریں' : 'فعّلتها، أعد المحاولة'}
                </button>
              </div>
              <button
                onClick={enterManualPicker}
                className="text-sm text-gray-400 dark:text-gray-500 underline mt-4"
              >
                {lang === 'en'
                  ? 'Or continue choosing a neighborhood (limited access)'
                  : lang === 'ur'
                    ? 'یا محلہ منتخب کریں (محدود رسائی)'
                    : 'أو تابع باختيار الحي (وصول محدود)'}
              </button>
            </div>
          )}

          {/* F. Manual neighborhood picker — limited access without GPS */}
          {locationStep === 'manual' && (
            <div className="flex-1 flex flex-col">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {lang === 'en' ? 'Choose your neighborhood' : lang === 'ur' ? 'اپنا محلہ منتخب کریں' : 'اختر حيّك'}
              </h1>
              <p className="text-gray-500 text-sm mb-1">
                {lang === 'en'
                  ? 'Select your neighborhood manually. Some features will be limited until location is verified.'
                  : lang === 'ur'
                    ? 'اپنا محلہ دستی طور پر منتخب کریں۔ مقام کی تصدیق تک کچھ خصوصیات محدود ہوں گی۔'
                    : 'اختر حيّك يدوياً. بعض المزايا ستكون محدودة حتى يتم التحقق من موقعك.'}
              </p>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 mb-4">
                <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                  ⚠️ {lang === 'en' ? 'Limited access — enable location later in Settings to unlock full features' : lang === 'ur' ? 'محدود رسائی — مکمل خصوصیات کیلئے بعد میں مقام فعال کریں' : 'وصول محدود — فعّل الموقع لاحقاً من الإعدادات لفتح جميع المزايا'}
                </p>
              </div>

              {manualLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <FiLoader className="w-6 h-6 text-primary-600 animate-spin" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5 mb-3 border border-gray-100 dark:border-gray-700">
                    <FiSearch className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={manualSearch}
                      onChange={(e) => setManualSearch(e.target.value)}
                      placeholder={lang === 'en' ? 'Search neighborhood...' : lang === 'ur' ? 'محلہ تلاش کریں...' : 'ابحث عن حي...'}
                      className="flex-1 bg-transparent text-sm focus:outline-none text-gray-800 dark:text-gray-100 placeholder:text-gray-400"
                    />
                  </div>
                  <div className="space-y-2 mb-6 flex-1 overflow-y-auto overscroll-contain" style={{ maxHeight: '40vh' }}>
                    {allNeighborhoods
                      .filter(n => {
                        if (!manualSearch.trim()) return true
                        const q = manualSearch.toLowerCase()
                        return n.name.toLowerCase().includes(q) || n.nameEn.toLowerCase().includes(q) || n.cityName.toLowerCase().includes(q) || n.cityNameEn.toLowerCase().includes(q)
                      })
                      .map(n => (
                        <button
                          key={n.id}
                          onClick={() => {
                            setSelectedNeighborhoodId(n.id)
                            setDetectedNeighborhood({
                              id: n.id,
                              name: n.name,
                              nameEn: n.nameEn,
                              distanceKm: 0,
                              confidence: 'low',
                              city: { id: '', name: n.cityName, nameEn: n.cityNameEn },
                            })
                          }}
                          className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border-2 transition-all ${
                            selectedNeighborhoodId === n.id
                              ? 'border-primary-600 bg-primary-600 text-white'
                              : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 text-gray-800 dark:text-white'
                          }`}
                        >
                          <span className={`text-xs ${selectedNeighborhoodId === n.id ? 'opacity-70' : 'text-gray-400'}`}>
                            {dn(n.cityName, n.cityNameEn)}
                          </span>
                          <span className="font-medium">{dn(n.name, n.nameEn)}</span>
                        </button>
                      ))}
                  </div>
                  <button
                    onClick={handleFinish}
                    disabled={loading || !selectedNeighborhoodId}
                    className="btn-primary flex items-center justify-center gap-2"
                  >
                    <FiCheck className="w-4 h-4" />
                    {loading
                      ? (lang !== 'en' ? 'جاري الحفظ...' : 'Saving...')
                      : (lang !== 'en' ? 'تأكيد الحي' : 'Confirm neighborhood')}
                  </button>
                </>
              )}
            </div>
          )}

          {/* G. Timeout — no sample at all. Retry only. */}
          {locationStep === 'timeout' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
              <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center">
                <FiLoader className="w-10 h-10 text-amber-400" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {lang !== 'en' ? 'تعذر تحديد موقعك' : "Couldn't detect your location"}
              </h1>
              <p className="text-gray-500 text-sm max-w-xs leading-relaxed">
                {lang === 'en'
                  ? "We couldn't determine your location right now. Make sure location services are on, then try again."
                  : 'تعذر تحديد موقعك حالياً. تأكد من تفعيل خدمات الموقع وأعد المحاولة.'}
              </p>
              <button
                onClick={requestLocation}
                className="btn-primary mt-4 w-full max-w-xs flex items-center justify-center gap-2"
              >
                <FiRefreshCw className="w-4 h-4" />
                {lang !== 'en' ? 'أعد المحاولة' : 'Try Again'}
              </button>
            </div>
          )}

        </div>
      )}
    </main>
  )
}

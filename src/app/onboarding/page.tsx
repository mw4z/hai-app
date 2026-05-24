'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiMapPin, FiLoader, FiCheck, FiArrowRight, FiArrowLeft, FiRefreshCw, FiSettings, FiSearch } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { useGPSLocation } from '@/hooks/useGPSLocation'
import { tryRedeemPendingInvite, getPendingInviteCode, savePendingInviteCode, isValidInviteCode } from '@/lib/pendingInvite'
import { useConfirm } from '@/components/ConfirmProvider'
import { clearLocalStoragePreservingPrefs } from '@/lib/clearStorageOnLogout'

type Step = 'name' | 'gender' | 'account_type' | 'location'

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

const NEARBY_MAX_RESULTS = 4

export default function OnboardingPage() {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const dn = (ar: string, en: string) => (lang === 'en' && en) ? en : ar
  const confirmDialog = useConfirm()
  const [step, setStep] = useState<Step>('name')

  // Escape hatch from the first onboarding step: a verified-but-incomplete
  // user is otherwise trapped here (the profile gate forces onboarding, and
  // "رجوع" → '/' just loops back). Sign out → return to phone entry so they
  // can change the number. Mirrors ProfileClient.handleLogout().
  async function changePhoneNumber() {
    const ok = await confirmDialog({
      title: dn('تغيير رقم الجوال', 'Change phone number'),
      message: dn('سيتم تسجيل خروجك للعودة إلى إدخال رقم جوال جديد.', "You'll be signed out to enter a new phone number."),
      confirmText: dn('تغيير الرقم', 'Change number'),
      cancelText: dn('إلغاء', 'Cancel'),
    })
    if (!ok) return
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    try {
      const { CapacitorCookies } = await import('@capacitor/core')
      await (CapacitorCookies as any)?.clearAllCookies?.()
    } catch { /* not on Capacitor */ }
    try { clearLocalStoragePreservingPrefs() } catch {}
    try { sessionStorage.clear() } catch {}
    window.location.href = '/'
  }
  const [name, setName] = useState('')
  const [lastName, setLastName] = useState('')
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'UNSPECIFIED'>('MALE')
  const [accountType, setAccountType] = useState<'NORMAL' | 'SERVICE_PROVIDER'>('NORMAL')
  // Invite code — prefilled from a code captured by /i/<code> when the
  // invite was opened in THIS webview, but always manually enterable so a
  // fresh app install (where the code lived in the external browser, not
  // here) can still type the code that's printed in the invite message.
  const [inviteCode, setInviteCode] = useState('')
  const [inviteAutoCaptured, setInviteAutoCaptured] = useState(false)
  useEffect(() => {
    const pending = getPendingInviteCode()
    if (pending) {
      setInviteCode(pending.code)
      setInviteAutoCaptured(true)
    }
  }, [])

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
    <button onClick={onClick} className="hai-link--back hai-self-start hai-mb-4">
      {lang !== 'en' ? <FiArrowRight className="hai-icon-md" /> : <FiArrowLeft className="hai-icon-md" />}
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

  async function loadAllNeighborhoods() {
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

  function enterManualPicker() {
    setLocationStep('manual')
    setUserLat(null)
    setUserLng(null)
    setUserAccuracy(null)
    if (allNeighborhoods.length === 0) {
      setManualLoading(true)
      loadAllNeighborhoods()
    }
  }

  useEffect(() => {
    if (!['denied', 'timeout', 'nearby'].includes(locationStep)) return
    if (allNeighborhoods.length > 0) return
    setManualLoading(true)
    loadAllNeighborhoods()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationStep])

  function tryDirectGeolocation() {
    if (!navigator.geolocation) {
      setLocationStep('timeout')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolveNeighborhood(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, false)
      },
      (err) => {
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

    if (error === 'denied' || error === 'unavailable') {
      tryDirectGeolocation()
      return
    }

    if (error === 'timeout' || (!result && !error)) {
      tryDirectGeolocation()
      return
    }

    if (error === 'low_accuracy' && result) {
      fetchNearbyAndShowPicker(result.lat, result.lng, result.accuracy)
      return
    }

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
        await fetchNearbyAndShowPicker(lat, lng, accuracy)
        return
      }
      const data = await res.json()

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
      // Claimed (selected while outside, GPS didn't confirm) → explain the
      // limited-rights state and the path to full permissions.
      const profileResult = await res.json().catch(() => ({} as { addressVerified?: boolean }))
      if (profileResult && profileResult.addressVerified === false) {
        toast(t('claim_linked_toast'), { icon: '📍', duration: 6000 })
      }
      try {
        const tourKeys = [
          'hai_tour_seen',
          'hai_tour_ride_create',
          'hai_tour_ride_detail',
          'hai_tour_post_create',
          'hai_tour_chat',
        ]
        for (const k of tourKeys) localStorage.removeItem(k)
        localStorage.removeItem('hai_splash')
        // First-run + contextual guides (مرشد حي): clear localStorage too.
        localStorage.removeItem('hai:first-run-guide-v1')
        localStorage.removeItem('hai:context-guides-disabled-v1')
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i)
          if (k && k.startsWith('hai:context-guide:')) localStorage.removeItem(k)
        }
        // Also expire the seen-COOKIES — they survive logout's
        // localStorage.clear(), so without this a brand-new account on a
        // device a previous user already toured/guided would never see
        // the tour or guides. Cookie names mirror the localStorage keys
        // with non-token chars replaced by '_'.
        const cookieNames = [
          ...tourKeys,
          'hai_first_run_guide_v1',
          'hai_context_guides_disabled_v1',
        ]
        for (const c of document.cookie.split(';')) {
          const name = c.split('=')[0].trim()
          if (name.startsWith('hai_context_guide_')) cookieNames.push(name)
        }
        for (const k of cookieNames) {
          document.cookie = `${k}=; path=/; max-age=0; SameSite=Lax`
        }
      } catch {}

      try { window.dispatchEvent(new CustomEvent('hai:auth-ready')) } catch {}

      // Persist whatever code the user typed (or the prefilled one) so the
      // shared redeem path picks it up. savePendingInviteCode validates the
      // HAI-XXXX format and no-ops on anything malformed — which is how a
      // fresh install (code only in the invite message, never in this
      // webview's storage) still gets attributed.
      const typedInvite = inviteCode.trim().toUpperCase()
      const hasTypedInvite = !!typedInvite
      if (hasTypedInvite) savePendingInviteCode(typedInvite)

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
          } else if (hasTypedInvite && (result.status === 'skip' || result.status === 'cleared')) {
            // The user explicitly entered a code but it didn't apply
            // (bad format → never saved, or not-found / self / too-late).
            // 'retry' (transient) stays silent — the code is kept.
            toast.error(t('onboard_invite_invalid'))
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

  const stepOrder: Step[] = ['name', 'gender', 'account_type', 'location']

  return (
    <main className="hai-screen">
      {/* Progress */}
      <div className="hai-progress hai-mb-5">
        {stepOrder.map((s, i) => (
          <div
            key={s}
            className="hai-progress__segment"
            data-active={stepOrder.indexOf(step) >= i ? 'true' : 'false'}
          />
        ))}
      </div>

      {/* Step: Name */}
      {step === 'name' && (
        <div className="hai-flex-1 hai-stack-3">
          <BackBtn onClick={changePhoneNumber} />
          <h1 className="hai-h2">{t('onboard_hello')}</h1>
          <p className="hai-caption hai-mb-4">{t('onboard_your_name')}</p>
          <input
            type="text"
            placeholder={t('onboard_first_name')}
            value={name}
            onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z؀-ۿݐ-ݿࢠ-ࣿ\s]/g, ''))}
            className="hai-input"
            autoFocus
            maxLength={50}
          />
          <input
            type="text"
            placeholder={t('onboard_last_name')}
            value={lastName}
            onChange={(e) => setLastName(e.target.value.replace(/[^a-zA-Z؀-ۿݐ-ݿࢠ-ࣿ\s]/g, ''))}
            className="hai-input"
            maxLength={50}
          />
          <input
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            placeholder={t('onboard_invite_label')}
            value={inviteCode}
            onChange={(e) => {
              setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 14))
              setInviteAutoCaptured(false)
            }}
            className="hai-input"
            maxLength={14}
          />
          <p className="hai-caption" style={{ marginTop: '-0.5rem' }}>
            {inviteAutoCaptured && isValidInviteCode(inviteCode)
              ? t('onboard_invite_applied')
              : t('onboard_invite_hint')}
          </p>
          <button
            onClick={() => { if (!name.trim()) { toast.error(t('onboard_name_required')); return } setStep('gender') }}
            className="hai-btn-primary hai-btn-block"
          >
            {t('onboard_next')}
          </button>
        </div>
      )}

      {/* Step: Gender */}
      {step === 'gender' && (
        <div className="hai-flex-1 hai-stack-4">
          <BackBtn onClick={() => setStep('name')} />
          <div className="hai-stack-1">
            <h1 className="hai-h2">{t('onboard_gender')}</h1>
            <p className="hai-caption">{t('onboard_gender_subtitle')}</p>
          </div>
          <div className="hai-option-grid-2">
            {[
              { value: 'MALE',   label: t('onboard_male'),   icon: '👨' },
              { value: 'FEMALE', label: t('onboard_female'), icon: '👩' },
            ].map((g) => (
              <button
                key={g.value}
                onClick={() => setGender(g.value as 'MALE' | 'FEMALE' | 'UNSPECIFIED')}
                data-active={gender === g.value ? 'true' : 'false'}
                className="hai-option hai-option--center"
              >
                <span className="hai-option__icon">{g.icon}</span>
                <span className="hai-option__title">{g.label}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setGender('UNSPECIFIED')}
            data-active={gender === 'UNSPECIFIED' ? 'true' : 'false'}
            className="hai-chip hai-chip--sm hai-self-center"
          >
            {lang === 'en' ? 'Prefer not to say' : lang === 'ur' ? 'بتانا نہیں چاہتا' : 'أفضل عدم التحديد'}
          </button>
          <button
            onClick={() => setStep('account_type')}
            className="hai-btn-primary hai-btn-block hai-mt-2"
          >
            {t('onboard_next')}
          </button>
        </div>
      )}

      {/* Step: Account Type */}
      {step === 'account_type' && (
        <div className="hai-flex-1 hai-stack-4">
          <BackBtn onClick={() => setStep('gender')} />
          <div className="hai-stack-1">
            <h1 className="hai-h2">
              {lang !== 'en' ? 'نوع الحساب' : 'Account Type'}
            </h1>
            <p className="hai-caption">
              {lang !== 'en' ? 'هل تقدم خدمة في الحي؟' : 'Do you offer a service in the neighborhood?'}
            </p>
          </div>
          <div className="hai-stack-3">
            <button
              onClick={() => setAccountType('NORMAL')}
              data-active={accountType === 'NORMAL' ? 'true' : 'false'}
              className="hai-option"
            >
              <span className="hai-option__icon">👤</span>
              <span className="hai-option__title">{lang !== 'en' ? 'مستخدم عادي' : 'Regular User'}</span>
              <span className="hai-option__desc">
                {lang !== 'en' ? 'أبحث عن خدمات وأتواصل مع جيراني' : 'Looking for services and connecting with neighbors'}
              </span>
            </button>
            <button
              onClick={() => setAccountType('SERVICE_PROVIDER')}
              data-active={accountType === 'SERVICE_PROVIDER' ? 'true' : 'false'}
              className="hai-option"
            >
              <span className="hai-option__icon">🛠</span>
              <span className="hai-option__title">{lang !== 'en' ? 'مقدم خدمة' : 'Service Provider'}</span>
              <span className="hai-option__desc">
                {lang !== 'en' ? 'أقدم خدمة (سباك، كهربائي، توصيل...)' : 'I offer a service (plumber, electrician, delivery...)'}
              </span>
            </button>
          </div>
          <button
            onClick={() => setStep('location')}
            className="hai-btn-primary hai-btn-block hai-mt-2"
          >
            {t('onboard_next')}
          </button>
        </div>
      )}

      {/* Step: Location */}
      {step === 'location' && (
        <div className="hai-flex-1 flex flex-col">

          {/* A. Initial: ask user to share location */}
          {locationStep === 'ask' && (
            <div className="hai-center-col">
              <div className="hai-icon-circle hai-icon-circle--brand">
                <FiMapPin className="hai-icon-xl" />
              </div>
              <h1 className="hai-h3">
                {lang !== 'en' ? 'تحديد حيّك' : 'Detect your neighborhood'}
              </h1>
              <p className="hai-caption">
                {lang === 'ar'
                  ? 'نحتاج موقعك لتحديد الحي المناسب'
                  : 'We need your location to find your neighborhood'}
              </p>
              <button
                onClick={requestLocation}
                className="hai-btn-primary hai-btn-block hai-mt-2"
              >
                <FiMapPin className="hai-icon-md" />
                {lang !== 'en' ? 'استخدم موقعي' : 'Use my location'}
              </button>
              <button
                onClick={() => setStep('gender')}
                className="hai-link hai-link--muted hai-link--underline"
              >
                {t('common_back')}
              </button>
            </div>
          )}

          {/* B. Detecting — spinner while collecting GPS samples */}
          {locationStep === 'detecting' && (
            <div className="hai-center-col">
              <div className="hai-icon-circle hai-icon-circle--brand">
                <FiMapPin className="hai-icon-xl animate-pulse" />
              </div>
              <h1 className="hai-h3">
                {lang !== 'en' ? 'جاري تحديد موقعك...' : 'Detecting your location...'}
              </h1>
              <div className="hai-row-2 hai-tc-brand">
                <FiLoader className="hai-icon-md animate-spin" />
                <span className="hai-caption hai-tc-brand">
                  {lang === 'en' ? 'Please allow location access' : lang === 'ur' ? 'براہ کرم مقام کی اجازت دیں' : 'يرجى السماح بالوصول للموقع'}
                </span>
              </div>
              {gps.sampleCount > 0 && (
                <p className="hai-meta">
                  {gps.sampleCount}/3
                </p>
              )}
            </div>
          )}

          {/* C. Precise match — confirm detected neighborhood */}
          {locationStep === 'confirm' && detectedNeighborhood && (
            <div className="hai-flex-1 hai-stack-4">
              <div className="hai-stack-1">
                <h1 className="hai-h2">
                  {lang !== 'en' ? 'تم تحديد موقعك' : 'Location detected'}
                </h1>
                <p className="hai-caption">
                  {lang !== 'en' ? 'هل هذا حيّك الصحيح؟' : 'Is this your neighborhood?'}
                </p>
              </div>

              <div className="hai-callout hai-callout--brand hai-text-center">
                <div className="hai-option__icon">📍</div>
                <p className="hai-h4">
                  {dn(detectedNeighborhood.name, detectedNeighborhood.nameEn)}
                </p>
                <p className="hai-caption hai-tc-brand">
                  {dn(detectedNeighborhood.city.name, detectedNeighborhood.city.nameEn)}
                </p>
                <p className="hai-meta hai-mt-1">
                  {detectedNeighborhood.distanceKm} {lang !== 'en' ? 'كم' : 'km'}
                </p>
                <p className={`hai-meta hai-mt-2 ${detectedNeighborhood.confidence === 'high' ? 'hai-tc-brand' : 'hai-tc-muted'}`}>
                  {detectedNeighborhood.confidence === 'high'
                    ? (lang !== 'en' ? 'دقة عالية ✓' : 'High accuracy ✓')
                    : (lang !== 'en' ? 'دقة متوسطة' : 'Medium accuracy')}
                </p>
              </div>

              <button
                onClick={handleFinish}
                disabled={loading}
                className="hai-btn-primary hai-btn-block"
              >
                <FiCheck className="hai-icon-lg" />
                {lang !== 'en' ? 'نعم، هذا حيّي' : 'Yes, this is my neighborhood'}
              </button>
              <button
                onClick={() => {
                  if (userLat != null && userLng != null) {
                    fetchNearbyAndShowPicker(userLat, userLng, userAccuracy ?? 9999)
                  }
                }}
                className="hai-link hai-link--muted hai-link--underline hai-text-center"
              >
                {lang !== 'en' ? 'لا، حيّي مختلف' : 'No, my neighborhood is different'}
              </button>
            </div>
          )}

          {/* D. Nearby picker */}
          {locationStep === 'nearby' && (
            <div className="hai-flex-1 hai-stack-4">
              <div className="hai-stack-1">
                <h1 className="hai-h2">
                  {lang !== 'en' ? 'اختر حيّك' : 'Choose your neighborhood'}
                </h1>
                <p className="hai-caption">
                  {lang === 'en'
                    ? "We couldn't pinpoint you exactly. Pick from the neighborhoods near your current location."
                    : 'تعذّر تحديد موقعك بدقة. اختر من الأحياء القريبة من موقعك الحالي.'}
                </p>
              </div>

              {nearbyLoading ? (
                <div className="hai-center-col">
                  <FiLoader className="hai-icon-lg hai-ic-brand animate-spin" />
                </div>
              ) : nearbyList.length === 0 ? (
                <div className="hai-center-col">
                  <div className="hai-option__icon">😕</div>
                  <p className="hai-caption">
                    {lang === 'en'
                      ? "We couldn't find neighborhoods near your location. Please try again."
                      : 'لم نتمكن من العثور على أحياء قريبة. يرجى المحاولة مرة أخرى.'}
                  </p>
                  <button
                    onClick={requestLocation}
                    className="hai-btn-primary"
                  >
                    <FiRefreshCw className="hai-icon-md" />
                    {lang !== 'en' ? 'إعادة تحديد الموقع' : 'Retry location'}
                  </button>
                </div>
              ) : (
                <>
                  <div className="hai-stack-2 hai-flex-1 hai-overflow-auto">
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
                        data-active={selectedNeighborhoodId === n.id ? 'true' : 'false'}
                        className="hai-option hai-row-3 hai-justify-between"
                      >
                        <span className="hai-meta">
                          {n.distanceKm} {lang !== 'en' ? 'كم' : 'km'} · {dn(n.city.name, n.city.nameEn)}
                        </span>
                        <span className="hai-option__title">{dn(n.name, n.nameEn)}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleFinish}
                    disabled={loading || !selectedNeighborhoodId}
                    className="hai-btn-primary hai-btn-block"
                  >
                    <FiCheck className="hai-icon-md" />
                    {loading
                      ? (lang !== 'en' ? 'جاري الحفظ...' : 'Saving...')
                      : (lang !== 'en' ? 'تأكيد الحي' : 'Confirm neighborhood')}
                  </button>
                  <button
                    onClick={requestLocation}
                    className="hai-link hai-link--muted hai-link--underline hai-row-1 hai-justify-center"
                  >
                    <FiRefreshCw className="hai-icon-xs" />
                    {lang !== 'en' ? 'إعادة تحديد الموقع' : 'Retry location'}
                  </button>
                  {/* Escape to the full searchable list — for users whose
                      neighborhood isn't among the GPS-nearby ones (e.g.
                      currently outside their home neighborhood). Picking
                      here links as CLAIMED_RESIDENT (limited until verified). */}
                  <button
                    onClick={enterManualPicker}
                    className="hai-link hai-link--brand hai-link--underline hai-row-1 hai-justify-center"
                  >
                    <FiSearch className="hai-icon-xs" />
                    {lang === 'en'
                      ? "My neighborhood isn't listed — browse all"
                      : lang === 'ur'
                        ? 'میرا محلہ یہاں نہیں — تمام دیکھیں'
                        : 'حيّي غير موجود؟ تصفّح كل الأحياء'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* E. Permission denied */}
          {locationStep === 'denied' && (
            <div className="hai-center-col">
              <div className="hai-icon-circle hai-icon-circle--danger">
                <FiMapPin className="hai-icon-xl" />
              </div>
              <h1 className="hai-h3">
                {lang === 'en' ? 'Location access is required' : lang === 'ur' ? 'مقام کی اجازت ضروری ہے' : 'صلاحية الموقع مطلوبة'}
              </h1>
              <p className="hai-caption">
                {lang === 'en'
                  ? 'We need your location to verify your neighborhood. Please enable location access in Settings to continue.'
                  : lang === 'ur'
                    ? 'آپ کے محلے کی تصدیق کیلئے مقام ضروری ہے۔ سیٹنگز سے مقام فعال کریں۔'
                    : 'نحتاج موقعك للتحقق من حيّك. فعّل صلاحية الموقع من الإعدادات للمتابعة.'}
              </p>
              <div className="hai-stack-3 hai-w-full hai-max-xs">
                <button
                  onClick={openSystemSettings}
                  className="hai-btn-primary hai-btn-block"
                >
                  <FiSettings className="hai-icon-md" />
                  {lang === 'en' ? 'Open Settings' : lang === 'ur' ? 'سیٹنگز کھولیں' : 'افتح الإعدادات'}
                </button>
                <button
                  onClick={retryAfterSettings}
                  className="hai-btn-ghost hai-btn-block"
                >
                  <FiRefreshCw className="hai-icon-md" />
                  {lang === 'en' ? "I've enabled it, try again" : lang === 'ur' ? 'فعال کر دیا، دوبارہ کوشش کریں' : 'فعّلتها، أعد المحاولة'}
                </button>
                <button
                  onClick={enterManualPicker}
                  className="hai-btn-ghost hai-btn-block is-brand"
                >
                  <FiSearch className="hai-icon-md" />
                  {lang === 'en'
                    ? 'Browse neighborhoods (limited access)'
                    : lang === 'ur'
                      ? 'محلے دیکھیں (محدود رسائی)'
                      : 'تصفّح الأحياء (وصول محدود)'}
                </button>
              </div>
            </div>
          )}

          {/* F. Manual neighborhood picker */}
          {locationStep === 'manual' && (
            <div className="hai-flex-1 hai-stack-4">
              <div className="hai-stack-1">
                <h1 className="hai-h2">
                  {lang === 'en' ? 'Choose your neighborhood' : lang === 'ur' ? 'اپنا محلہ منتخب کریں' : 'اختر حيّك'}
                </h1>
                <p className="hai-caption">
                  {lang === 'en'
                    ? 'Select your neighborhood manually. Some features will be limited until location is verified.'
                    : lang === 'ur'
                      ? 'اپنا محلہ دستی طور پر منتخب کریں۔ مقام کی تصدیق تک کچھ خصوصیات محدود ہوں گی۔'
                      : 'اختر حيّك يدوياً. بعض المزايا ستكون محدودة حتى يتم التحقق من موقعك.'}
                </p>
              </div>

              <div className="hai-callout hai-callout--warning">
                📍 {t('claim_outside_hint')}
              </div>

              {manualLoading ? (
                <div className="hai-center-col">
                  <FiLoader className="hai-icon-lg hai-ic-brand animate-spin" />
                </div>
              ) : (
                <>
                  <div className="hai-input-group">
                    <span className="hai-input-affix">
                      <FiSearch className="hai-icon-md hai-ic-faint" />
                    </span>
                    <input
                      type="text"
                      value={manualSearch}
                      onChange={(e) => setManualSearch(e.target.value)}
                      placeholder={lang === 'en' ? 'Search neighborhood...' : lang === 'ur' ? 'محلہ تلاش کریں...' : 'ابحث عن حي...'}
                    />
                  </div>
                  <div className="hai-stack-2 hai-flex-1 hai-overflow-auto">
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
                          data-active={selectedNeighborhoodId === n.id ? 'true' : 'false'}
                          className="hai-option hai-row-3 hai-justify-between"
                        >
                          <span className="hai-meta">
                            {dn(n.cityName, n.cityNameEn)}
                          </span>
                          <span className="hai-option__title">{dn(n.name, n.nameEn)}</span>
                        </button>
                      ))}
                  </div>
                  <button
                    onClick={handleFinish}
                    disabled={loading || !selectedNeighborhoodId}
                    className="hai-btn-primary hai-btn-block"
                  >
                    <FiCheck className="hai-icon-md" />
                    {loading
                      ? (lang !== 'en' ? 'جاري الحفظ...' : 'Saving...')
                      : (lang !== 'en' ? 'تأكيد الحي' : 'Confirm neighborhood')}
                  </button>
                </>
              )}
            </div>
          )}

          {/* G. Timeout */}
          {locationStep === 'timeout' && (
            <div className="hai-center-col">
              <div className="hai-icon-circle hai-icon-circle--warning">
                <FiLoader className="hai-icon-xl" />
              </div>
              <h1 className="hai-h3">
                {lang !== 'en' ? 'تعذر تحديد موقعك' : "Couldn't detect your location"}
              </h1>
              <p className="hai-caption">
                {lang === 'en'
                  ? "We couldn't determine your location right now. Make sure location services are on, then try again."
                  : 'تعذر تحديد موقعك حالياً. تأكد من تفعيل خدمات الموقع وأعد المحاولة.'}
              </p>
              <button
                onClick={requestLocation}
                className="hai-btn-primary hai-btn-block hai-mt-2"
              >
                <FiRefreshCw className="hai-icon-md" />
                {lang !== 'en' ? 'أعد المحاولة' : 'Try Again'}
              </button>
            </div>
          )}

        </div>
      )}
    </main>
  )
}

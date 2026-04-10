'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import { useRidePoll } from '@/hooks/useRidePoll'
import { hapticSuccess, hapticMedium, hapticError, hapticWarning } from '@/lib/haptic'
import StatusBadge from '@/components/rides/StatusBadge'
import RiyalIcon from '@/components/RiyalIcon'
import UserBadgeDisplay from '@/components/UserBadge'
import {
  FiMapPin, FiClock, FiNavigation, FiSend, FiStar, FiX, FiArrowRight, FiArrowLeft, FiCamera,
  FiAlertTriangle, FiChevronDown, FiChevronUp, FiTruck, FiMessageCircle
} from 'react-icons/fi'

interface Props { rideId: string; currentUserId: string }

// ─── Phase helpers ──────────────────────────────────────────────────────────

type Phase = 'offers' | 'waiting_confirm' | 'trip_active' | 'pending_complete' | 'terminal'

function getPhase(status: string): Phase {
  if (status === 'RIDE_OPEN') return 'offers'
  if (status === 'RIDE_SELECTED') return 'waiting_confirm'
  if (['RIDE_CONFIRMED', 'RIDE_EN_ROUTE', 'RIDE_ARRIVED', 'RIDE_IN_PROGRESS'].includes(status)) return 'trip_active'
  if (status === 'RIDE_PENDING_COMPLETION') return 'pending_complete'
  return 'terminal'
}

const TRIP_STATUS_DISPLAY: Record<string, { icon: string; ar: string; en: string; color: string }> = {
  RIDE_CONFIRMED:   { icon: '✅', ar: 'تم التأكيد',       en: 'Confirmed',          color: 'text-blue-600 dark:text-blue-400' },
  RIDE_EN_ROUTE:    { icon: '🚗', ar: 'في الطريق',        en: 'On The Way',         color: 'text-indigo-600 dark:text-indigo-400' },
  RIDE_ARRIVED:     { icon: '📍', ar: 'وصل',              en: 'Arrived',            color: 'text-purple-600 dark:text-purple-400' },
  RIDE_IN_PROGRESS: { icon: '🛣',  ar: 'المشوار جاري',     en: 'In Progress',        color: 'text-sky-600 dark:text-sky-400' },
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function RideDetailClient({ rideId, currentUserId }: Props) {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const { data: pollData, refetch } = useRidePoll(rideId)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const [ride, setRide] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [messages, setMessages] = useState<any[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [showRating, setShowRating] = useState(false)
  const [rating, setRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [showCancel, setShowCancel] = useState(false)
  const [showDispute, setShowDispute] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [offerPrice, setOfferPrice] = useState('')
  const [offerArrival, setOfferArrival] = useState('')
  const [offerMessage, setOfferMessage] = useState('')
  const [offerSubmitting, setOfferSubmitting] = useState(false)
  const [myOffer, setMyOffer] = useState<any>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [countdown, setCountdown] = useState('')
  const [countdownPct, setCountdownPct] = useState(100)
  const [autoCloseCountdown, setAutoCloseCountdown] = useState('')
  const [showTimeline, setShowTimeline] = useState(false)

  // ── Data fetching ─────────────────────────────────────────────────────────

  async function fetchRide() {
    try {
      const res = await fetch(`/api/rides/${rideId}`)
      if (!res.ok) { router.push('/rides'); return }
      const data = await res.json()
      if (data && typeof data === 'object') {
        setRide(data)
      }
    } catch (err) {
      console.error('[RideDetail] fetchRide failed:', err)
    }
    setLoading(false)
  }

  useEffect(() => { fetchRide() }, [rideId])
  useEffect(() => {
    if (pollData && ride && pollData.status !== ride.status) fetchRide()
  }, [pollData?.status])

  // ── Arrival alert: sound + vibration + overlay when driver arrives ──────────
  const [showArrivalAlert, setShowArrivalAlert] = useState(false)
  const arrivalAlerted = useRef(false)
  useEffect(() => {
    const newStatus = pollData?.status || ride?.status
    const isRequester = ride?.requester?.id === currentUserId
    if (newStatus === 'RIDE_ARRIVED' && isRequester && !arrivalAlerted.current) {
      arrivalAlerted.current = true
      setShowArrivalAlert(true)
      import('@/lib/arrival-alert').then(m => m.triggerArrivalAlert()).catch(() => {})
    }
  }, [pollData?.status, ride?.status, ride?.requester?.id, currentUserId])

  // Chat polling
  async function fetchMessages() {
    try {
      const res = await fetch(`/api/rides/${rideId}/messages`)
      if (res.ok) setMessages(await res.json())
    } catch { /* */ }
  }

  const status = (pollData?.status || ride?.status || 'RIDE_OPEN') as string
  const phase = getPhase(status)
  const chatAllowed = ['RIDE_CONFIRMED', 'RIDE_EN_ROUTE', 'RIDE_ARRIVED', 'RIDE_IN_PROGRESS', 'RIDE_PENDING_COMPLETION'].includes(status)

  useEffect(() => {
    if (!chatAllowed) return
    fetchMessages()
    const id = setInterval(fetchMessages, 5000)
    return () => clearInterval(id)
  }, [chatAllowed])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  // Auto-refetch ride data (offers, status changes) every 5 seconds
  // Stops polling on terminal states (completed, cancelled, expired)
  const terminalStatuses = ['RIDE_COMPLETED', 'RIDE_CANCELLED', 'RIDE_EXPIRED']
  useEffect(() => {
    const currentStatus = pollData?.status || ride?.status
    if (currentStatus && terminalStatuses.includes(currentStatus)) return
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      fetchRide()
    }, 5000)
    return () => clearInterval(id)
  }, [rideId, pollData?.status, ride?.status])

  // ── Countdown: confirm deadline ───────────────────────────────────────────

  useEffect(() => {
    if (!pollData?.confirmDeadline) { setCountdown(''); return }
    const deadline = new Date(pollData.confirmDeadline).getTime()
    const total = 5 * 60 * 1000
    const tick = () => {
      const left = deadline - Date.now()
      if (left <= 0) { setCountdown('0:00'); setCountdownPct(0); return }
      setCountdownPct(Math.round((left / total) * 100))
      setCountdown(`${Math.floor(left / 60000)}:${Math.floor((left % 60000) / 1000).toString().padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [pollData?.confirmDeadline])

  // ── Countdown: auto-close ─────────────────────────────────────────────────

  useEffect(() => {
    if (!pollData?.autoCloseAt) { setAutoCloseCountdown(''); return }
    const deadline = new Date(pollData.autoCloseAt).getTime()
    const tick = () => {
      const left = deadline - Date.now()
      if (left <= 0) { setAutoCloseCountdown('0:00'); return }
      setAutoCloseCountdown(`${Math.floor(left / 60000)}:${Math.floor((left % 60000) / 1000).toString().padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [pollData?.autoCloseAt])

  // ── API action handler (race-condition aware) ─────────────────────────────

  async function apiAction(url: string, body: any, successMsg?: string) {
    if (actionLoading) return false // Prevent double-submit
    setActionLoading(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) {
        hapticError()
        toast.error(lang !== 'en' ? data.message : (data.messageEn || data.error || 'Error'))
        if (data.shouldRefresh) fetchRide()
        return false
      }
      hapticSuccess()
      if (successMsg) toast.success(successMsg)
      await fetchRide()
      return true
    } catch { hapticError(); toast.error(lang === 'en' ? 'Connection error' : lang === 'ur' ? 'رابطہ ناکام' : 'تعذر الاتصال'); return false }
    finally { setActionLoading(false) }
  }

  const [sendingMsg, setSendingMsg] = useState(false)
  const [sendingImg, setSendingImg] = useState(false)
  const imgInputRef = useRef<HTMLInputElement>(null)

  async function sendImage(file: File) {
    if (sendingImg) return
    if (!file.type.startsWith('image/')) { toast.error(lang === 'en' ? 'Images only' : 'صور فقط'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error(lang === 'en' ? 'Max 5MB' : 'الحد الأقصى 5 ميقا'); return }
    setSendingImg(true)
    try {
      // Upload image first
      const formData = new FormData()
      formData.append('images', file)
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
      if (!uploadRes.ok) { toast.error(lang === 'en' ? 'Upload failed' : 'فشل رفع الصورة'); return }
      const { urls } = await uploadRes.json()
      if (!urls?.[0]) return

      // Send as IMAGE message
      const res = await fetch(`/api/rides/${rideId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'IMAGE', imageUrl: urls[0] }),
      })
      if (res.ok) fetchMessages()
    } catch {
      toast.error(lang === 'en' ? 'Failed to send photo' : 'فشل إرسال الصورة')
    } finally {
      setSendingImg(false)
      if (imgInputRef.current) imgInputRef.current.value = ''
    }
  }

  async function sendMessage() {
    if (!newMsg.trim() || sendingMsg) return
    setSendingMsg(true)
    try {
      const res = await fetch(`/api/rides/${rideId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: newMsg.trim() }) })
      if (res.ok) { setNewMsg(''); fetchMessages() }
    } catch {
      toast.error(lang === 'en' ? 'Failed to send' : 'فشل الإرسال')
    } finally {
      setSendingMsg(false)
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const isRequester = ride?.requester?.id === currentUserId
  const isDriver = ride?.trip?.driverId === currentUserId || ride?.offers?.some((o: any) => (o.driver?.id === currentUserId || o.driverId === currentUserId) && o.status === 'OFFER_ACCEPTED')
  const isParticipant = isRequester || isDriver
  const isTerminal = ['RIDE_COMPLETED', 'RIDE_CANCELLED', 'RIDE_EXPIRED'].includes(status)
  const offers = ride?.offers || []
  // Check if current user already submitted an offer
  const existingOffer = offers.find((o: any) => o.driver?.id === currentUserId)
  const hasMyOffer = !!existingOffer || !!myOffer
  const canOffer = !isRequester && status === 'RIDE_OPEN' && !hasMyOffer

  // ── Offer analysis ────────────────────────────────────────────────────────

  const offerAnalysis = useMemo(() => {
    const pending = offers.filter((o: any) => ['OFFER_PENDING', 'OFFER_ACCEPTED'].includes(o.status))
    if (pending.length === 0) return { sorted: [], recommended: null, bestPriceId: null, fastestId: null, topRatedId: null }

    const bestPrice = pending.reduce((a: any, b: any) => a.price < b.price ? a : b)
    const fastest = pending.reduce((a: any, b: any) => a.arrivalMin < b.arrivalMin ? a : b)
    const rated = pending.filter((o: any) => o.driver?.driverRatingAvg !== null && o.driver?.driverTripsCount >= 5)
    const topRated = rated.length > 0 ? rated.reduce((a: any, b: any) => (a.driver?.driverRatingAvg || 0) > (b.driver?.driverRatingAvg || 0) ? a : b) : null

    // Recommended: best value (good price + good rating)
    let recommended = bestPrice
    if (topRated && topRated.price <= bestPrice.price * 1.3) recommended = topRated

    // Sort: recommended first, then by price
    const sorted = [...pending].sort((a: any, b: any) => {
      if (a.id === recommended?.id) return -1
      if (b.id === recommended?.id) return 1
      return a.price - b.price
    })

    return { sorted, recommended, bestPriceId: bestPrice.id, fastestId: fastest.id, topRatedId: topRated?.id }
  }, [offers])

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-primary-600"><div className="hai-loader" style={{width:48,height:48}}><svg viewBox="0 0 64 64" fill="none" className="w-full h-full"><circle className="hai-dot hai-dot-center" cx="32" cy="35" r="6" fill="currentColor"/><circle className="hai-dot hai-dot-top" cx="32" cy="15" r="4" fill="currentColor"/><circle className="hai-dot hai-dot-br" cx="48" cy="47" r="4" fill="currentColor"/><circle className="hai-dot hai-dot-bl" cx="16" cy="47" r="4" fill="currentColor"/></svg></div></div>
  if (!ride) return null

  const countdownColor = countdownPct > 50 ? 'text-green-600' : countdownPct > 20 ? 'text-amber-500' : 'text-red-500'
  const countdownBg = countdownPct > 50 ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800' : countdownPct > 20 ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800' : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800'
  const isTripMode = phase === 'trip_active' || phase === 'pending_complete'

  return (
    <div className={`min-h-screen ${isTripMode ? 'bg-gray-900' : 'bg-gray-50 dark:bg-gray-900'} flex flex-col`}>

      {/* ═══ ARRIVAL ALERT OVERLAY ═══════════════════════════════════════════ */}
      {showArrivalAlert && (
        <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-6" onClick={() => setShowArrivalAlert(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 max-w-sm w-full text-center animate-bounce-in" onClick={e => e.stopPropagation()}>
            <div className="text-6xl mb-4 animate-pulse">📍</div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {lang === 'en' ? 'Driver Arrived!' : lang === 'ur' ? 'ڈرائیور پہنچ گیا!' : 'وصل!'}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              {lang === 'en' ? 'The person is waiting at the pickup point' : lang === 'ur' ? 'شخص پک اپ پوائنٹ پر منتظر ہے' : 'الشخص ينتظرك عند نقطة الانطلاق'}
            </p>
            <button
              onClick={() => setShowArrivalAlert(false)}
              className="w-full bg-primary-600 text-white py-3.5 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
            >
              {lang === 'en' ? 'Got it' : lang === 'ur' ? 'ٹھیک ہے' : 'تمام'}
            </button>
          </div>
          <style jsx>{`
            @keyframes bounce-in {
              0% { opacity: 0; transform: scale(0.8); }
              60% { opacity: 1; transform: scale(1.03); }
              100% { transform: scale(1); }
            }
            .animate-bounce-in { animation: bounce-in 0.4s ease-out; }
          `}</style>
        </div>
      )}

      {/* ═══ SECTION A: Header (always visible) ═══════════════════════════════ */}
      <header className={`${isTripMode ? 'bg-gray-800 border-gray-700' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'} border-b px-4 py-3 sticky top-0 z-20`}>
        <div className="flex items-center gap-3">
          <Link href="/rides" className={`flex items-center gap-1 ${isTripMode ? 'text-gray-400' : 'text-gray-500 dark:text-gray-400'} py-1`}>
            {lang !== 'en' ? <FiArrowRight className="w-5 h-5" /> : <FiArrowLeft className="w-5 h-5" />}
            <span className="text-sm font-medium">{lang === 'en' ? 'Back' : lang === 'ur' ? 'واپس' : 'رجوع'}</span>
          </Link>
          <div className="flex-1 min-w-0">
            <div className={`flex items-center gap-1.5 text-sm font-semibold ${isTripMode ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
              <FiMapPin className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              <span className="truncate">{ride.pickupArea}</span>
              <span className="text-gray-400">{lang !== 'en' ? '←' : '→'}</span>
              <FiMapPin className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
              <span className="truncate">{ride.dropoffArea}</span>
            </div>
            <div className={`flex items-center gap-3 text-[11px] mt-0.5 ${isTripMode ? 'text-gray-400' : 'text-gray-400'}`}>
              <span>{ride.distanceKm} {t('ride_km')}</span>
              <span>~{ride.durationMin} {t('ride_min')}</span>
            </div>
          </div>
          <div data-tour="ride-status"><StatusBadge status={status} /></div>
        </div>
        {pollData?.isLate && (
          <div className="mt-2 bg-red-500/20 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
            <FiAlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs font-semibold text-red-400">{t('rides_late')}</span>
          </div>
        )}
      </header>

      {/* ═══ SECTION B: Primary Action Area (state-driven) ════════════════════ */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-32 space-y-4">

        {/* ── Phase: OFFERS ──────────────────────────────────────────────────── */}
        {phase === 'offers' && (
          <>
            {/* Ride info summary (for drivers viewing the ride) */}
            {!isRequester && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary-100 overflow-hidden flex-shrink-0">
                    {ride.requester?.avatarUrl ? <img src={ride.requester.avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-primary-700 font-bold text-xs">{ride.requester?.name?.[0]}</span>}
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{ride.requester?.name}</span>
                  {ride.isImmediate ? (
                    <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full font-medium ml-auto">{t('ride_now')}</span>
                  ) : ride.scheduledAt ? (
                    <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium ml-auto">
                      {new Date(ride.scheduledAt).toLocaleTimeString(lang !== 'en' ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  ) : null}
                </div>
              </div>
            )}

            {/* Driver: submit offer form */}
            {!isRequester && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                {hasMyOffer ? (
                  <div className="text-center py-4">
                    <div className="text-3xl mb-2">✅</div>
                    <p className="font-bold text-gray-900 dark:text-white">{lang === 'en' ? 'Offer submitted' : lang === 'ur' ? 'آپ کی پیشکش بھیج دی' : 'تم إرسال عرضك'}</p>
                    <p className="text-sm text-gray-400 mt-1">{lang === 'en' ? "You'll be notified if selected" : lang === 'ur' ? 'منتخب ہونے پر اطلاع ملے گی' : 'ستصلك إشعار إذا تم اختيارك'}</p>
                    {(existingOffer || myOffer) && (
                      <div className="mt-3 flex items-center justify-center gap-3">
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-xl px-3 py-2">
                          <span className="text-sm font-bold text-primary-600 dark:text-primary-400">
                            {existingOffer?.price || myOffer?.price} <RiyalIcon size="1em" />
                          </span>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-xl px-3 py-2">
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            <FiClock className="w-3.5 h-3.5 inline mr-1" />
                            {existingOffer?.arrivalMin || myOffer?.arrivalMin} {t('ride_min')}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <h3 className="font-bold text-gray-900 dark:text-white mb-3">{t('ride_submit_offer')}</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{t('ride_your_price')}</label>
                        <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                          <input type="number" min="1" value={offerPrice}
                            onChange={e => setOfferPrice(e.target.value)}
                            placeholder="25"
                            className="flex-1 px-4 py-3 text-sm bg-transparent text-gray-900 dark:text-white focus:outline-none"
                          />
                          <span className="px-3 text-sm text-gray-400 border-l border-gray-200 dark:border-gray-700 py-3 flex items-center"><RiyalIcon size="1.1em" /></span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{t('ride_arrival_time')}</label>
                        <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                          <input type="number" min="1" max="120" value={offerArrival}
                            onChange={e => setOfferArrival(e.target.value)}
                            placeholder="10"
                            className="flex-1 px-4 py-3 text-sm bg-transparent text-gray-900 dark:text-white focus:outline-none"
                          />
                          <span className="px-3 text-sm text-gray-400 border-l border-gray-200 dark:border-gray-700 py-3">{t('ride_min')}</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">{t('ride_message')}</label>
                        <input type="text" value={offerMessage}
                          onChange={e => setOfferMessage(e.target.value)}
                          placeholder={lang === 'en' ? 'e.g. Camry 2024, great AC' : lang === 'ur' ? 'مثال: کیمری 2024، بہترین ائرکنڈیشنر' : 'مثال: كامري 2024، تكييف ممتاز'}
                          maxLength={100}
                          className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm bg-transparent text-gray-900 dark:text-white focus:outline-none"
                        />
                      </div>
                      <button
                        onClick={async () => {
                          if (!offerPrice || parseInt(offerPrice) < 1) { toast.error(lang === 'en' ? 'Enter price' : lang === 'ur' ? 'قیمت درج کریں' : 'أدخل السعر'); return }
                          if (!offerArrival || parseInt(offerArrival) < 1) { toast.error(lang === 'en' ? 'Enter arrival time' : lang === 'ur' ? 'پہنچنے کا وقت درج کریں' : 'أدخل وقت الوصول'); return }
                          setOfferSubmitting(true)
                          try {
                            const res = await fetch(`/api/rides/${rideId}/offers`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ price: parseInt(offerPrice), arrivalMin: parseInt(offerArrival), message: offerMessage.trim() || undefined }),
                            })
                            const data = await res.json()
                            if (!res.ok) {
                              toast.error(lang !== 'en' ? (data.message || data.error) : (data.messageEn || data.error))
                              if (data.shouldRefresh) fetchRide()
                            } else {
                              setMyOffer(data)
                              toast.success(lang === 'en' ? 'Offer submitted' : lang === 'ur' ? 'آپ کی پیشکش بھیج دی' : 'تم إرسال عرضك')
                              fetchRide()
                            }
                          } catch { toast.error(lang === 'en' ? 'Connection error' : lang === 'ur' ? 'رابطہ ناکام' : 'تعذر الاتصال') }
                          setOfferSubmitting(false)
                        }}
                        disabled={offerSubmitting || !offerPrice || !offerArrival}
                        className="w-full bg-primary-600 text-white rounded-xl py-3.5 font-bold text-sm active:scale-[0.97] disabled:opacity-40 shadow-lg shadow-primary-600/20"
                      >
                        {offerSubmitting ? '...' : t('ride_submit_offer')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Requester: waiting or viewing offers */}
            <div data-tour="ride-offers">
            {isRequester && offerAnalysis.sorted.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FiClock className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                </div>
                <p className="text-gray-900 dark:text-white font-bold text-lg mb-1">
                  {lang === 'en' ? 'Waiting for offers' : lang === 'ur' ? 'پیشکشوں کا انتظار' : 'بانتظار العروض'}
                </p>
                <p className="text-gray-400 text-sm max-w-[250px] mx-auto">
                  {lang === 'en' ? "Neighbors will submit offers soon — you'll be notified" : lang === 'ur' ? 'پڑوسی جلد پیشکش دیں گے' : 'الجيران سيقدمون عروضهم قريباً — ستصلك إشعارات'}
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-900 dark:text-white">
                    {lang !== 'en' ? `${offerAnalysis.sorted.length} عروض` : `${offerAnalysis.sorted.length} Offers`}
                  </h3>
                  <span className="text-xs text-gray-400">
                    {lang !== 'en' ? `${offerAnalysis.sorted.length} عروض` : `${offerAnalysis.sorted.length} offers`}
                  </span>
                </div>
                <div className="space-y-3">
                  {offerAnalysis.sorted.map((offer: any, idx: number) => {
                    const isRecommended = false
                    const isBestPrice = false
                    const isFastest = offer.id === offerAnalysis.fastestId
                    const isTopRated = offer.id === offerAnalysis.topRatedId
                    const d = offer.driver || {} as any

                    return (
                      <div key={offer.id} className={`rounded-2xl border-2 p-4 transition-all ${
                        isRecommended
                          ? 'border-primary-500 bg-primary-50/60 dark:bg-primary-900/20'
                          : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800'
                      }`}>

                        <div className="flex items-start gap-3">
                          <div className="w-11 h-11 rounded-full bg-primary-100 overflow-hidden flex-shrink-0">
                            {d.avatarUrl ? <img src={d.avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-primary-700 font-bold">{d.name?.[0]}</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-sm text-gray-900 dark:text-white">{d.name || (lang !== 'en' ? 'شخص' : 'Person')}</span>
                              <UserBadgeDisplay accountType={d.accountType} reputation={d.reputation} />
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
                              {d.driverRatingAvg > 0 && <span className="flex items-center gap-0.5"><FiStar className="w-3 h-3 text-amber-500" /> {d.driverRatingAvg}</span>}
                              <span>🚗 {d.driverTripsCount || 0} {t('ride_trips')}</span>
                              {d.cancelRate > 0 && <span className="text-red-400">{d.cancelRate}% {t('ride_cancel_rate')}</span>}
                            </div>
                            {offer.message && <p className="text-xs text-gray-500 mt-1 italic">"{offer.message}"</p>}
                          </div>
                          <div className="text-end flex-shrink-0">
                            <div className="text-lg font-black text-primary-600 dark:text-primary-400 flex items-center gap-1">{offer.price} <RiyalIcon size="1em" /></div>
                            <div className="text-[11px] text-gray-400 flex items-center gap-0.5 justify-end"><FiClock className="w-3 h-3" /> {offer.arrivalMin} {t('ride_min')}</div>
                          </div>
                        </div>

                        {isRequester && (
                          <button
                            data-tour={idx === 0 ? 'ride-select' : undefined}
                            onClick={() => { setSelecting(offer.id); apiAction(`/api/rides/${rideId}/select`, { offerId: offer.id }).then(() => setSelecting(null)) }}
                            disabled={selecting !== null}
                            className={`mt-3 w-full py-3 rounded-xl text-sm font-bold active:scale-[0.97] transition-all ${
                              isRecommended
                                ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/30'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                            } disabled:opacity-40`}>
                            {selecting === offer.id ? '...' : t('ride_select')}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          </>
        )}

        {/* ── Phase: WAITING CONFIRM ─────────────────────────────────────────── */}
        {phase === 'waiting_confirm' && (
          <div className={`rounded-2xl border-2 p-6 text-center ${countdownBg}`}>
            {isDriver ? (
              <>
                <div className={`text-5xl font-black mb-3 ${countdownColor}`}>{countdown || '—'}</div>
                <p className="text-gray-700 dark:text-gray-300 font-semibold mb-1">
                  {lang === 'en' ? 'You were selected!' : lang === 'ur' ? 'آپ منتخب ہو گئے!' : 'تم اختيارك!'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {lang === 'en' ? 'Confirm before time runs out' : lang === 'ur' ? 'وقت ختم ہونے سے پہلے تصدیق کریں' : 'أكّد قبل انتهاء الوقت'}
                </p>
                <button onClick={() => apiAction(`/api/rides/${rideId}/confirm`, {})} disabled={actionLoading}
                  className="w-full bg-primary-600 text-white rounded-xl py-4 font-bold text-base shadow-lg shadow-primary-600/30 active:scale-[0.97] disabled:opacity-50">
                  {actionLoading ? '...' : lang !== 'en' ? '✓ تأكيد القبول' : '✓ Confirm Acceptance'}
                </button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mx-auto mb-4 relative">
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="16" fill="none" strokeWidth="3" stroke="currentColor" className="text-gray-200 dark:text-gray-600" />
                    <circle cx="18" cy="18" r="16" fill="none" strokeWidth="3" stroke="currentColor" className={countdownColor}
                      strokeDasharray="100" strokeDashoffset={100 - countdownPct} strokeLinecap="round" />
                  </svg>
                  <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${countdownColor}`}>{countdown}</span>
                </div>
                <p className="font-bold text-gray-900 dark:text-white text-lg">{t('ride_waiting_confirm')}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {lang === 'en' ? '5 minutes to confirm' : lang === 'ur' ? 'تصدیق کیلئے 5 منٹ باقی' : 'لديه 5 دقائق للتأكيد'}
                </p>
              </>
            )}
          </div>
        )}

        {/* ── Phase: TRIP ACTIVE (Trip Mode) ─────────────────────────────────── */}
        {phase === 'trip_active' && (() => {
          const display = TRIP_STATUS_DISPLAY[status]
          return (
            <div className="text-center">
              {/* Big status indicator */}
              <div className="py-8">
                <div className="text-6xl mb-3">{display?.icon}</div>
                <p className={`text-2xl font-black ${display?.color || 'text-white'}`}>
                  {lang !== 'en' ? display?.ar : display?.en}
                </p>
              </div>

              {/* Single clear action button (driver) */}
              {isDriver && (
                <div className="px-2">
                  {status === 'RIDE_CONFIRMED' && (
                    <button onClick={() => {
                      apiAction(`/api/rides/${rideId}/status`, { action: 'en_route' })
                      // Open Google Maps navigation to pickup
                      if (ride.pickupLat) window.open(`https://www.google.com/maps/dir/?api=1&destination=${ride.pickupLat},${ride.pickupLng}&travelmode=driving`, '_blank')
                    }} disabled={actionLoading}
                      className="w-full bg-indigo-600 text-white rounded-2xl py-4 font-bold text-base shadow-lg shadow-indigo-600/30 active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-2">
                      <FiNavigation className="w-5 h-5" /> {t('ride_driver_action_en_route')}
                    </button>
                  )}
                  {status === 'RIDE_EN_ROUTE' && (
                    <button onClick={() => apiAction(`/api/rides/${rideId}/status`, { action: 'arrived' })} disabled={actionLoading}
                      className="w-full bg-purple-600 text-white rounded-2xl py-4 font-bold text-base shadow-lg shadow-purple-600/30 active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-2">
                      <FiMapPin className="w-5 h-5" /> {t('ride_driver_action_arrived')}
                    </button>
                  )}
                  {status === 'RIDE_ARRIVED' && (
                    <button onClick={() => {
                      apiAction(`/api/rides/${rideId}/status`, { action: 'start' })
                      // Open Google Maps navigation to dropoff
                      if (ride.dropoffLat) window.open(`https://www.google.com/maps/dir/?api=1&destination=${ride.dropoffLat},${ride.dropoffLng}&travelmode=driving`, '_blank')
                    }} disabled={actionLoading}
                      className="w-full bg-sky-600 text-white rounded-2xl py-4 font-bold text-base shadow-lg shadow-sky-600/30 active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-2">
                      🚗 {t('ride_driver_action_start')}
                    </button>
                  )}
                  {status === 'RIDE_IN_PROGRESS' && (
                    <button onClick={() => apiAction(`/api/rides/${rideId}/status`, { action: 'mark_done' })} disabled={actionLoading}
                      className="w-full bg-green-600 text-white rounded-2xl py-4 font-bold text-base shadow-lg shadow-green-600/30 active:scale-[0.97] disabled:opacity-50 flex items-center justify-center gap-2">
                      ✓ {t('ride_driver_action_done')}
                    </button>
                  )}
                </div>
              )}

              {/* Locations + navigation buttons (driver only after confirmation) */}
              {ride.pickupAddress && (
                <div className="mt-6 mx-2 space-y-2">
                  {/* Pickup */}
                  <div className="bg-gray-800 rounded-xl p-3 flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
                    <p className="flex-1 text-xs text-gray-300 truncate">{ride.pickupAddress}</p>
                    {isDriver && ride.pickupLat && ['RIDE_CONFIRMED', 'RIDE_EN_ROUTE'].includes(status) && (
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${ride.pickupLat},${ride.pickupLng}&travelmode=driving`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex-shrink-0 bg-blue-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 active:scale-95">
                        <FiNavigation className="w-3 h-3" /> {lang === 'en' ? 'Navigate' : lang === 'ur' ? 'نیویگیٹ' : 'انتقل'}
                      </a>
                    )}
                  </div>
                  {/* Dropoff */}
                  <div className="bg-gray-800 rounded-xl p-3 flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
                    <p className="flex-1 text-xs text-gray-300 truncate">{ride.dropoffAddress}</p>
                    {isDriver && ride.dropoffLat && ['RIDE_ARRIVED', 'RIDE_IN_PROGRESS'].includes(status) && (
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${ride.dropoffLat},${ride.dropoffLng}&travelmode=driving`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex-shrink-0 bg-red-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 active:scale-95">
                        <FiNavigation className="w-3 h-3" /> {lang === 'en' ? 'Navigate' : lang === 'ur' ? 'نیویگیٹ' : 'انتقل'}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* ── Phase: PENDING COMPLETION ───────────────────────────────────────── */}
        {phase === 'pending_complete' && (
          <div className="text-center py-6">
            <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiAlertTriangle className="w-10 h-10 text-orange-500" />
            </div>
            {isRequester ? (
              <>
                <p className="text-xl font-black text-white mb-2">{t('ride_pending_complete')}</p>
                <p className="text-sm text-gray-400 mb-1">
                  {lang === 'en' ? 'Says you arrived — did you?' : lang === 'ur' ? 'کہتا ہے پہنچ گئے — کیا واقعی پہنچ گئے؟' : 'يقول وصلتم — هل وصلت فعلاً؟'}
                </p>
                {autoCloseCountdown && (
                  <p className="text-xs text-orange-600 dark:text-orange-400 mb-5">
                    {t('ride_auto_close')} {lang !== 'en' ? 'خلال' : 'in'} {autoCloseCountdown}
                  </p>
                )}
                <button onClick={() => apiAction(`/api/rides/${rideId}/status`, { action: 'complete' })} disabled={actionLoading}
                  className="w-full bg-green-600 text-white rounded-2xl py-4 font-bold text-base shadow-lg shadow-green-600/30 active:scale-[0.97] disabled:opacity-50">
                  {actionLoading ? '...' : `✓ ${t('ride_confirm_arrival')}`}
                </button>

                {!showDispute ? (
                  <button onClick={() => setShowDispute(true)}
                    className="mt-3 text-sm text-red-500 font-medium">
                    {t('ride_dispute')}
                  </button>
                ) : (
                  <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                      {lang === 'en' ? 'What is the dispute reason?' : lang === 'ur' ? 'تنازعے کی وجہ کیا ہے؟' : 'ما سبب النزاع؟'}
                    </p>
                    <textarea value={disputeReason} onChange={e => setDisputeReason(e.target.value)}
                      placeholder={lang !== 'en' ? 'مثال: لم أصل بعد، أخذ طريق خاطئ...' : 'e.g. I haven\'t arrived yet, wrong route...'}
                      className="w-full border border-red-200 dark:border-red-700 rounded-xl p-3 text-sm bg-transparent text-gray-900 dark:text-white resize-none"
                      rows={2} maxLength={500} />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (disputeReason.trim().length < 10) { toast.error(lang === 'en' ? 'Explain reason (10+ chars)' : lang === 'ur' ? 'وجہ بیان کریں (کم از کم 10 حروف)' : 'اشرح السبب (10 أحرف على الأقل)'); return }
                          apiAction(`/api/rides/${rideId}/status`, { action: 'dispute', reason: disputeReason.trim() }).then(ok => { if (ok) setShowDispute(false) })
                        }}
                        disabled={actionLoading}
                        className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50">
                        {actionLoading ? '...' : t('ride_dispute')}
                      </button>
                      <button onClick={() => setShowDispute(false)}
                        className="px-4 py-2.5 text-sm text-gray-500">{t('common_close')}</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-xl font-black text-white mb-2">
                  {lang === 'en' ? 'Waiting for requester' : lang === 'ur' ? 'مسافر کی تصدیق کا انتظار' : 'بانتظار تأكيد الراكب'}
                </p>
                <p className="text-sm text-gray-400">
                  {lang === 'en' ? 'Will auto-close if no response' : lang === 'ur' ? 'جواب نہ آنے پر خودکار بند ہو جائے گا' : 'سيتم الإغلاق تلقائياً إذا لم يرد'}
                </p>
                {autoCloseCountdown && <p className="text-xs text-orange-500 mt-2">{autoCloseCountdown}</p>}
              </>
            )}
          </div>
        )}

        {/* ── Phase: TERMINAL ────────────────────────────────────────────────── */}
        {phase === 'terminal' && (
          <>
            {status === 'RIDE_COMPLETED' && (
              <div className="text-center py-8">
                <div className="text-5xl mb-3">✅</div>
                <p className="text-xl font-black text-gray-900 dark:text-white">{t('ride_completed')}</p>
                {ride.trip?.completionMode === 'AUTO_CLOSED' && (
                  <span className="inline-block mt-2 text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">{t('ride_auto_closed')}</span>
                )}
                {isParticipant && !showRating && (
                  <button onClick={() => setShowRating(true)}
                    className="mt-5 bg-primary-600 text-white rounded-xl px-8 py-3 font-bold active:scale-[0.97] shadow-lg shadow-primary-600/30">
                    <FiStar className="w-4 h-4 inline mr-1.5" />{t('ride_rate_trip')}
                  </button>
                )}
              </div>
            )}
            {status === 'RIDE_CANCELLED' && (
              <div className="text-center py-12">
                <div className="text-5xl mb-3">❌</div>
                <p className="text-xl font-black text-gray-900 dark:text-white">{t('ride_cancelled')}</p>
                {ride.trip?.cancelReason && <p className="text-sm text-gray-500 mt-2">{ride.trip.cancelReason}</p>}
              </div>
            )}
            {status === 'RIDE_EXPIRED' && (
              <div className="text-center py-12">
                <div className="text-5xl mb-3">⏰</div>
                <p className="text-xl font-black text-gray-600 dark:text-gray-300">{t('ride_expired')}</p>
              </div>
            )}
            {status === 'RIDE_DISPUTED' && (
              <div className="text-center py-12">
                <div className="text-5xl mb-3">⚖️</div>
                <p className="text-xl font-black text-yellow-700 dark:text-yellow-300">{t('ride_disputed')}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-[280px] mx-auto">
                  {lang === 'en' ? 'Dispute is under admin review' : lang === 'ur' ? 'تنازعہ انتظامیہ کے جائزے میں ہے' : 'النزاع قيد المراجعة من قبل الإدارة'}
                </p>
                {isRequester && (
                  <button
                    onClick={() => apiAction(`/api/rides/${rideId}/status`, { action: 'withdraw_dispute' },
                      lang !== 'en' ? 'تم سحب النزاع' : 'Dispute withdrawn')}
                    disabled={actionLoading}
                    className="mt-5 bg-yellow-600 text-white rounded-xl px-6 py-3 font-bold text-sm active:scale-[0.97] disabled:opacity-50">
                    {actionLoading ? '...' : (lang === 'en' ? 'Withdraw Dispute' : lang === 'ur' ? 'تنازعہ واپس لیں' : 'سحب النزاع والعودة')}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Rating form ─────────────────────────────────────────────────────── */}
        {showRating && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="font-bold text-gray-900 dark:text-white text-center mb-4">{isRequester ? t('ride_rate_driver') : t('ride_rate_requester')}</h3>
            <div className="flex justify-center gap-3 mb-5">
              {[1,2,3,4,5].map(s => (
                <button key={s} onClick={() => { setRating(s); hapticMedium() }} className={`text-4xl transition-all ${rating >= s ? 'scale-110' : 'opacity-20 scale-90'}`}>⭐</button>
              ))}
            </div>
            <textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder={t('ride_comment')} rows={2} maxLength={200}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl p-3 text-sm bg-transparent text-gray-900 dark:text-white resize-none mb-3" />
            {ride.trip?.completionMode === 'AUTO_CLOSED' && (
              <p className="text-xs text-amber-500 text-center mb-3">⚠️ {lang === 'en' ? 'Auto-closed — lower rating weight' : lang === 'ur' ? 'خودکار بند — آپ کی درجہ بندی کم وزن رکھتی ہے' : 'مشوار مغلق تلقائياً — تقييمك بوزن أقل'}</p>
            )}
            <button onClick={() => { apiAction(`/api/rides/${rideId}/rate`, { score: rating, comment: ratingComment }, lang === 'en' ? 'Thanks for rating' : lang === 'ur' ? 'آپ کی درجہ بندی کا شکریہ' : 'شكراً لتقييمك').then(ok => { if (ok) router.push('/rides') }) }}
              disabled={actionLoading || rating === 0}
              className="w-full bg-primary-600 text-white rounded-xl py-3 font-bold disabled:opacity-40 active:scale-[0.97]">
              {actionLoading ? '...' : t('ride_send_rating')}
            </button>
          </div>
        )}

        {/* ── Collapsible Timeline ────────────────────────────────────────────── */}
        {isParticipant && phase !== 'offers' && (
          <button onClick={() => setShowTimeline(!showTimeline)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium ${isTripMode ? 'bg-gray-800 text-gray-300' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-700'}`}>
            <span>{lang === 'en' ? 'Timeline' : lang === 'ur' ? 'سفر کے مراحل' : 'مراحل المشوار'}</span>
            {showTimeline ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
          </button>
        )}
        {showTimeline && (
          <div className={`px-4 py-3 rounded-xl ${isTripMode ? 'bg-gray-800' : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700'}`}>
            {(() => {
              const steps = [
                { label: lang !== 'en' ? 'تم الطلب' : 'Requested', ts: ride.createdAt, done: true },
                { label: lang !== 'en' ? 'تم الاختيار' : 'Selected', ts: ride.selectedAt, done: !!ride.selectedAt },
                { label: lang !== 'en' ? 'تم التأكيد' : 'Confirmed', ts: ride.trip?.confirmedAt, done: !!ride.trip?.confirmedAt },
                { label: lang !== 'en' ? 'في الطريق' : 'En Route', ts: ride.trip?.enRouteAt || pollData?.trip?.enRouteAt, done: !!(ride.trip?.enRouteAt || pollData?.trip?.enRouteAt) },
                { label: lang !== 'en' ? 'وصل' : 'Arrived', ts: ride.trip?.arrivedAt || pollData?.trip?.arrivedAt, done: !!(ride.trip?.arrivedAt || pollData?.trip?.arrivedAt) },
                { label: lang !== 'en' ? 'بدأت' : 'Started', ts: ride.trip?.startedAt || pollData?.trip?.startedAt, done: !!(ride.trip?.startedAt || pollData?.trip?.startedAt) },
                { label: lang !== 'en' ? 'اكتملت' : 'Completed', ts: ride.trip?.completedAt || pollData?.trip?.completedAt, done: !!(ride.trip?.completedAt || pollData?.trip?.completedAt) },
              ]
              return steps.map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full mt-1 ${s.done ? 'bg-primary-500' : 'bg-gray-400'}`} />
                    {i < steps.length - 1 && <div className={`w-0.5 h-5 ${s.done ? 'bg-primary-400' : 'bg-gray-500'}`} />}
                  </div>
                  <div className="flex-1 flex items-center justify-between pb-1">
                    <span className={`text-sm ${s.done ? 'text-white font-semibold' : 'text-gray-400'}`}>{s.label}</span>
                    {s.ts && <span className="text-xs text-gray-400">{new Date(s.ts).toLocaleTimeString(lang !== 'en' ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                </div>
              ))
            })()}
          </div>
        )}

        {/* ── Notes ───────────────────────────────────────────────────────────── */}
        {ride.notes && phase === 'offers' && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-2xl p-4">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">
              {lang === 'en' ? '📝 Requester Notes' : lang === 'ur' ? '📝 مسافر کے نوٹس' : '📝 ملاحظات الراكب'}
            </p>
            <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{ride.notes}</p>
          </div>
        )}

        {/* Disclaimer */}
        {phase === 'offers' && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center leading-relaxed px-4">
            {t('ride_disclaimer')}
          </p>
        )}

        </div>
      </div>

      {/* ═══ SECTION C: Anchored Bottom (Chat + Cancel) ═══════════════════════ */}

      {/* Chat + Cancel (anchored at bottom) */}
      {chatAllowed && isParticipant && (
        <div className="fixed bottom-0 left-0 right-0 z-10 bg-gray-900/95 backdrop-blur-sm" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {/* Messages */}
          <div className="max-h-36 overflow-y-auto px-4 py-2 space-y-1.5" style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 100%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 100%)' }}>
            {messages.slice(-10).map((msg: any) => (
              <div key={msg.id} className={`flex ${msg.senderId === currentUserId ? 'justify-end' : 'justify-start'}`}>
                {msg.type === 'IMAGE' && msg.imageUrl ? (
                  <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="block max-w-[70%]">
                    <img src={msg.imageUrl} alt="" className={`rounded-2xl max-h-40 object-cover border-2 ${
                      msg.senderId === currentUserId ? 'border-primary-600' : 'border-gray-500'
                    }`} />
                  </a>
                ) : (
                  <div className={`max-w-[70%] rounded-2xl px-3 py-1.5 text-xs ${
                    msg.senderId === currentUserId
                      ? 'bg-primary-600 text-white rounded-br-sm'
                      : 'bg-gray-500 text-white rounded-bl-sm'
                  }`}>{msg.body}</div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          {/* Input + cancel */}
          <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-700">
            {/* Photo button */}
            <input ref={imgInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) sendImage(f) }} />
            <button
              onClick={() => imgInputRef.current?.click()}
              disabled={sendingImg}
              className="p-2.5 rounded-full bg-gray-700 text-gray-300 active:scale-90 disabled:opacity-50 flex-shrink-0"
            >
              <FiCamera className={`w-4 h-4 ${sendingImg ? 'animate-pulse' : ''}`} />
            </button>
            <input value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder={t('ride_type_message')}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-full px-4 py-2.5 text-sm focus:outline-none text-white placeholder-gray-400" />
            <button onClick={sendMessage} disabled={sendingMsg} className="bg-primary-600 text-white p-2.5 rounded-full active:scale-90 disabled:opacity-50">
              <FiSend className="w-4 h-4" />
            </button>
          </div>
          {/* Cancel always available during trip */}
          {!isTerminal && status !== 'RIDE_DISPUTED' && (
            <div className="px-3 pb-2">
              {!showCancel ? (
                <button onClick={() => setShowCancel(true)} className="w-full text-center text-xs text-red-400 font-medium py-1">
                  {t('ride_cancel_trip')}
                </button>
              ) : (
                <div className="bg-gray-800 border border-red-800 rounded-xl p-3 space-y-2">
                  <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                    placeholder={lang === 'en' ? 'Cancel reason (required)' : lang === 'ur' ? 'منسوخی کی وجہ (ضروری)' : 'سبب الإلغاء (مطلوب)'}
                    className="w-full border border-gray-600 rounded-xl p-2.5 text-sm bg-transparent text-white resize-none placeholder-gray-400" rows={2} />
                  <div className="flex gap-2">
                    <button onClick={() => {
                      if (!cancelReason.trim()) { toast.error(lang === 'en' ? 'Enter cancel reason' : lang === 'ur' ? 'منسوخی کی وجہ لکھیں' : 'اكتب سبب الإلغاء'); return }
                      apiAction(`/api/rides/${rideId}/status`, { action: 'cancel', reason: cancelReason }).then(ok => ok && setShowCancel(false))
                    }} disabled={actionLoading}
                      className="flex-1 bg-red-600 text-white rounded-xl py-2 text-sm font-semibold disabled:opacity-50">{actionLoading ? '...' : (lang === 'en' ? 'Confirm Cancel' : lang === 'ur' ? 'منسوخی کی تصدیق' : 'تأكيد الإلغاء')}</button>
                    <button onClick={() => setShowCancel(false)} className="px-3 py-2 text-sm text-gray-400">{t('common_close')}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cancel for non-chat states */}
      {isParticipant && !isTerminal && status !== 'RIDE_DISPUTED' && !chatAllowed && (
        <div className="fixed bottom-6 left-0 right-0 text-center">
          {!showCancel ? (
            <button onClick={() => setShowCancel(true)} className="text-xs text-red-400 font-medium">{t('ride_cancel_trip')}</button>
          ) : (
            <div className="mx-4 bg-white dark:bg-gray-800 rounded-2xl border border-red-200 dark:border-red-800 p-4 shadow-xl">
              <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                placeholder={lang === 'en' ? 'Cancel reason (required)' : lang === 'ur' ? 'منسوخی کی وجہ (ضروری)' : 'سبب الإلغاء (مطلوب)'}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl p-3 text-sm bg-transparent text-gray-900 dark:text-white resize-none mb-3" rows={2} />
              <div className="flex gap-2">
                <button onClick={() => {
                  if (!cancelReason.trim()) { toast.error(lang === 'en' ? 'Enter cancel reason' : lang === 'ur' ? 'منسوخی کی وجہ لکھیں' : 'اكتب سبب الإلغاء'); return }
                  apiAction(`/api/rides/${rideId}/status`, { action: 'cancel', reason: cancelReason }).then(ok => ok && setShowCancel(false))
                }} disabled={actionLoading}
                  className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50">{actionLoading ? '...' : (lang === 'en' ? 'Confirm Cancel' : lang === 'ur' ? 'منسوخی کی تصدیق' : 'تأكيد الإلغاء')}</button>
                <button onClick={() => setShowCancel(false)} className="px-4 py-2.5 text-sm text-gray-500">{t('common_close')}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

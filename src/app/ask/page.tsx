'use client'

/**
 * Ask neighbors composer — separate, simpler entry point from the
 * regular post composer. Posts an `intent: 'REQUEST'` post through the
 * same /api/posts route so all the existing moderation, rate-limiting,
 * and notification fanout still applies.
 *
 * Per Phase 3.5 spec: this is a SEPARATE entry point, NOT an intent
 * toggle inside the category picker. The default category is SERVICES
 * (most "looking for ..." asks are service requests) but the user can
 * pick another from the optional category strip.
 */

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiArrowRight, FiArrowLeft, FiSend } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { useNetworkStatus } from '@/lib/network'
import { translateApiError } from '@/lib/apiError'
import { getCurrentPositionSafe } from '@/lib/location/getCurrentPositionSafe'
import { playSuccess, playError } from '@/lib/sound'
import { t as translate } from '@/lib/i18n'
import { inferAskCategory } from '@/lib/classify/inferAskCategory'

// Optional category strip — Ask flow excludes COMPETITIONS (admin-only,
// nothing to ask there) and GENERAL (admin-only fallback). Order
// mirrors the post composer for muscle memory.
interface AskCategory { key: string; label: string; labelEn: string; labelUr: string; icon: string }
// Same UX-driven order as the composer + feed chips. COMPETITIONS is
// intentionally omitted because requests don't make sense for an
// admin-curated competitions bucket.
const ASK_CATEGORIES: AskCategory[] = [
  // Row 1 — core
  { key: 'MARKETPLACE',          label: 'السوق',                labelEn: 'Marketplace',          labelUr: 'مارکیٹ',         icon: '🛒' },
  { key: 'SERVICES',             label: 'خدمات',                labelEn: 'Services',             labelUr: 'خدمات',          icon: '🔧' },
  { key: 'HOME_BUSINESSES',      label: 'الأسر المنتجة',     labelEn: 'Home Businesses',      labelUr: 'گھریلو کاروبار', icon: '🍱' },
  // Row 2 — daily needs
  { key: 'RIDES',                label: 'مشاوير',               labelEn: 'Rides',                labelUr: 'سواری',          icon: '🚗' },
  { key: 'REAL_ESTATE',          label: 'عقارات',               labelEn: 'Real Estate',          labelUr: 'جائیداد',        icon: '🏠' },
  // Row 3 — important / urgent
  { key: 'NEIGHBORHOOD_REPORTS', label: 'بلاغات الحي',          labelEn: 'Neighborhood Reports', labelUr: 'محلے کی رپورٹس', icon: '⚠️' },
  { key: 'LOST_FOUND',           label: 'مفقودات',              labelEn: 'Lost & Found',         labelUr: 'گمشدہ اشیاء',   icon: '🔍' },
  // Row 4 — social / optional
  { key: 'EVENTS',               label: 'فعاليات',              labelEn: 'Events',               labelUr: 'تقریبات',        icon: '🎉' },
]

const DEFAULT_CATEGORY = 'SERVICES'

// Cycling placeholder examples — same idea as the legacy LOOKING_FOR
// flow. AR is the dominant language so the cycle is anchored there;
// EN / UR examples are used when the UI lang matches.
const PLACEHOLDER_EXAMPLES_AR = [
  'سباك موثوق',
  'شقة للإيجار',
  'توصية طبيبة',
  'فني تكييف',
  'معلمة تأسيس',
]
const PLACEHOLDER_EXAMPLES_EN = [
  'a trusted plumber',
  'an apartment for rent',
  'a doctor recommendation',
  'an AC technician',
  'a tutor for my kids',
]
const PLACEHOLDER_EXAMPLES_UR = [
  'معتبر پلمبر',
  'کرائے کیلئے فلیٹ',
  'ڈاکٹر کی سفارش',
  'اے سی ٹیکنیشن',
  'ٹیوٹر',
]

export default function AskNeighborsPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const { isOffline } = useNetworkStatus()

  const [text, setText] = useState('')
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORY)
  // Track whether the user has explicitly overridden the suggested
  // category. Once they pick anything from the strip, we stop nudging
  // it on every keystroke — their choice is sacred.
  const [userOverrode, setUserOverrode] = useState(false)
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)

  // v1 rule-based suggestion. Runs synchronously on every text change
  // (sub-millisecond). If the user has manually picked a category, we
  // do NOT overwrite their choice — only the auto-default is updated.
  useEffect(() => {
    if (userOverrode) return
    const suggested = inferAskCategory(text)
    setCategory((prev) => (prev === suggested ? prev : suggested))
  }, [text, userOverrode])
  const [location, setLocation] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [detectingLocation, setDetectingLocation] = useState(false)
  const [loading, setLoading] = useState(false)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)

  // Cycle placeholder examples every 2.5s while the input is empty.
  useEffect(() => {
    if (text.trim()) return
    const id = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_EXAMPLES_AR.length)
    }, 2500)
    return () => clearInterval(id)
  }, [text])

  // Mark the body full-screen so the page-transition template applies a
  // crossfade rather than a translate slide that would reparent our
  // fixed inset-0 main during the route-in animation.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.setAttribute('data-full-screen', 'true')
    return () => { document.body.removeAttribute('data-full-screen') }
  }, [])

  const examples =
    lang === 'en' ? PLACEHOLDER_EXAMPLES_EN
    : lang === 'ur' ? PLACEHOLDER_EXAMPLES_UR
    : PLACEHOLDER_EXAMPLES_AR
  const placeholderText =
    lang === 'en' ? `Looking for ${examples[placeholderIdx]}…`
    : lang === 'ur' ? `${examples[placeholderIdx]} تلاش کر رہا ہوں…`
    : `أبحث عن ${examples[placeholderIdx]}…`

  const labelOf = (c: AskCategory) =>
    lang === 'en' ? c.labelEn : lang === 'ur' ? c.labelUr : c.label

  const selectedCategory = ASK_CATEGORIES.find(c => c.key === category)

  async function handleSubmit() {
    if (loading) return
    const trimmed = text.trim()
    if (!trimmed) {
      toast.error(translate('ask_input_placeholder', lang))
      return
    }
    if (trimmed.length < 5) {
      toast.error(
        lang === 'en' ? 'Add a bit more detail.'
        : lang === 'ur' ? 'مزید تفصیل لکھیں۔'
        : 'أضف تفاصيل أكثر.',
      )
      return
    }
    if (isOffline) {
      toast.error(
        lang === 'en'
          ? 'No internet connection. Try again when reconnected.'
          : lang === 'ur'
            ? 'انٹرنیٹ کنکشن نہیں — دوبارہ کنیکٹ ہونے پر کوشش کریں'
            : 'لا يوجد اتصال — حاول مرة أخرى عند عودة الإنترنت',
      )
      return
    }

    setLoading(true)
    try {
      // Title is the first line / first 60 chars; body is the full
      // input. The server enforces classify defaults (priority: HIGH
      // for LOST_FOUND/NEIGHBORHOOD_REPORTS) — we just send the v2
      // category + REQUEST intent and let classifyPost handle the rest.
      const firstLine = trimmed.split(/\r?\n/)[0]
      const title = firstLine.slice(0, 60)
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body: trimmed,
          category,
          intent: 'REQUEST',
          locationLat: location?.lat || null,
          locationLng: location?.lng || null,
          locationName: location?.name || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        playError()
        toast.error(translateApiError(data, lang as 'ar' | 'en' | 'ur'), { duration: 4500 })
        return
      }
      playSuccess()
      toast.success(
        lang === 'en' ? 'Sent to your neighbors!'
        : lang === 'ur' ? 'پڑوسیوں کو بھیج دیا!'
        : 'وصل سؤالك للجيران!',
      )
      sessionStorage.setItem('hai_feed_refresh', '1')
      router.push('/feed')
    } catch {
      toast.error(
        lang === 'en'
          ? "Couldn't connect. Check your internet and try again."
          : lang === 'ur'
            ? 'کنیکشن نہیں بن سکا۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔'
            : 'تعذر الاتصال. تحقّق من الإنترنت وحاول مرة أخرى.',
        { duration: 4500 },
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="fixed inset-0 flex flex-col bg-white dark:bg-gray-900 z-10">
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-4 border-b border-gray-100 dark:border-gray-700"
           style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
        <button onClick={() => router.push('/feed')} className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 py-1">
          {lang !== 'en' ? <FiArrowRight className="w-5 h-5" /> : <FiArrowLeft className="w-5 h-5" />}
          <span className="text-sm font-medium">{lang === 'en' ? 'Cancel' : lang === 'ur' ? 'منسوخ' : 'إلغاء'}</span>
        </button>
        <h1 className="flex-1 text-center font-bold text-gray-900 dark:text-white">
          {translate('ask_neighbors', lang)}
        </h1>
        <button
          onClick={handleSubmit}
          disabled={loading || !text.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary-600 text-white font-bold text-sm shadow-md active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
          style={{
            boxShadow: '0 4px 12px -2px rgba(0, 109, 87, 0.45), 0 2px 4px -1px rgba(0, 0, 0, 0.12)',
          }}
        >
          {!loading && <FiSend className="w-4 h-4" />}
          <span>
            {loading
              ? (lang === 'en' ? 'Sending…' : lang === 'ur' ? 'بھیج رہا ہے…' : 'جاري الإرسال…')
              : translate('ask_submit', lang)}
          </span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
        {/* Big input */}
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholderText}
          maxLength={500}
          rows={5}
          className="input-field text-lg leading-relaxed resize-none"
        />

        {/* Optional category picker — collapsed by default; tapping
            "category" reveals the strip. While the user types, the v1
            rule-based inferAskCategory() updates the chip. The hint
            text changes from "Category (optional)" to "Suggested
            category" once a non-default suggestion has matched, so
            the user knows it was inferred — and can still tap to
            override (sets userOverrode). */}
        <div>
          <button
            type="button"
            onClick={() => setShowCategoryPicker(v => !v)}
            className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 active:scale-[0.99] transition-transform"
          >
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {userOverrode
                ? (lang === 'en' ? 'Category' : lang === 'ur' ? 'زمرہ' : 'القسم')
                : category !== DEFAULT_CATEGORY
                  ? (lang === 'en' ? 'Suggested category' : lang === 'ur' ? 'تجویز کردہ زمرہ' : 'القسم المقترح')
                  : (lang === 'en' ? 'Category (optional)' : lang === 'ur' ? 'زمرہ (اختیاری)' : 'القسم (اختياري)')}
            </span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-gray-100">
              {selectedCategory && (
                <>
                  <span>{selectedCategory.icon}</span>
                  <span>{labelOf(selectedCategory)}</span>
                </>
              )}
            </span>
          </button>
          {showCategoryPicker && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {ASK_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => {
                    setCategory(c.key)
                    setUserOverrode(true)
                    setShowCategoryPicker(false)
                  }}
                  className={`flex flex-col items-center justify-center gap-1 aspect-square p-2 rounded-xl border active:scale-[0.97] transition-transform ${
                    category === c.key
                      ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                  }`}
                >
                  <span className="text-xl">{c.icon}</span>
                  <span className="text-[10px] font-medium text-gray-700 dark:text-gray-200 text-center leading-tight">
                    {labelOf(c)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Optional location */}
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-2">
            📍 {lang === 'en' ? 'Attach location (optional)' : lang === 'ur' ? 'مقام شامل کریں (اختیاری)' : 'إرفاق موقع (اختياري)'}
          </label>
          {location ? (
            <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
              <span className="text-lg">📍</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{location.name || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}</p>
              </div>
              <button onClick={() => setLocation(null)} className="text-gray-400 p-1">✕</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={async () => {
                setDetectingLocation(true)
                try {
                  const pos = await getCurrentPositionSafe({ enableHighAccuracy: true, timeout: 10000 })
                  const { latitude: lat, longitude: lng } = pos.coords
                  let name = `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                  try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=${lang}&addressdetails=1`)
                    const data = await res.json()
                    name = data.address?.suburb || data.address?.neighbourhood || data.address?.road || data.display_name?.split(',')[0] || name
                  } catch { /* */ }
                  setLocation({ lat, lng, name })
                } catch {
                  toast.error(lang === 'en' ? 'Allow location access' : lang === 'ur' ? 'براہ کرم مقام کی اجازت دیں' : 'يرجى السماح بالوصول للموقع')
                } finally {
                  setDetectingLocation(false)
                }
              }} disabled={detectingLocation}
                className="flex-1 flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-700 rounded-xl py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:border-primary-400 transition-colors">
                {detectingLocation ? <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /> : '📍'}
                {lang === 'en' ? 'My Location' : lang === 'ur' ? 'میرا مقام' : 'موقعي الحالي'}
              </button>
              <button type="button" onClick={async () => {
                const { openMapPicker } = await import('@/components/rides/openMapPicker')
                const result = await openMapPicker({
                  centerLat: 21.4, centerLng: 39.8, lang,
                  maptilerKey: process.env.NEXT_PUBLIC_MAPTILER_KEY || '',
                })
                if (result) setLocation({ lat: result.lat, lng: result.lng, name: result.area || result.address.split(',')[0] })
              }}
                className="flex-1 flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-700 rounded-xl py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:border-primary-400 transition-colors">
                🗺️ {lang === 'en' ? 'Pick on map' : lang === 'ur' ? 'نقشے سے منتخب کریں' : 'اختر من الخريطة'}
              </button>
            </div>
          )}
        </div>

        {/* Helper hint — same tone as the LOOKING_FOR hint on the
            legacy composer so the user knows their request is going
            neighborhood-wide. */}
        <div className="bg-sky-50 dark:bg-sky-900/30 rounded-xl p-3">
          <p className="text-sky-700 dark:text-sky-300 text-xs">
            🔎 {lang === 'en'
              ? 'Your question goes to neighbors in your area — they reply directly.'
              : lang === 'ur'
                ? 'آپ کا سوال محلے کے پڑوسیوں کو جائے گا — وہ خود جواب دیں گے۔'
                : 'سيُعرض سؤالك للجيران في حيّك — هم يردوا عليك مباشرة'}
          </p>
        </div>
      </div>
    </main>
  )
}

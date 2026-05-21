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
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiArrowRight, FiArrowLeft, FiSend, FiImage, FiX } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { useNetworkStatus } from '@/lib/network'
import { translateApiError } from '@/lib/apiError'
import { getCurrentPositionSafe } from '@/lib/location/getCurrentPositionSafe'
import { playSuccess, playError } from '@/lib/sound'
import { t as translate } from '@/lib/i18n'
import { inferAskCategory } from '@/lib/classify/inferAskCategory'
import { pickImagesOrFallback, pickImageFromCamera } from '@/lib/imagePicker'
import ImageSourceSheet from '@/components/ImageSourceSheet'
import { uploadFiles } from '@/lib/upload'
import DirectoryEntryCard from '@/components/places/DirectoryEntryCard'
import ContextualGuide from '@/components/ContextualGuide'

/** نَبْضي ask-page guide steps. Three short cards: what this
 *  screen is for, what to type, and what happens after submit. */
const ASK_GUIDE_STEPS = [
  {
    targetSelector: null,
    title: 'اسأل أهل الحي',
    body: 'اكتب طلبك أو سؤالك، ومرشد حي يساعدك توصل للقسم المناسب.',
    position: 'center' as const,
    nextLabel: 'التالي',
  },
  {
    targetSelector: '[data-guide="ask-text"]',
    title: 'اكتب بطريقتك',
    body: 'مثلاً: أبغى سباك، وين صيدلية، أو أفضل مطعم قريب.',
    position: 'bottom' as const,
    nextLabel: 'التالي',
  },
  {
    targetSelector: '[data-guide="ask-submit"]',
    title: 'أرسل الطلب',
    body: 'بعد الإرسال يظهر لجيرانك في الحي.',
    position: 'bottom' as const,
    nextLabel: 'فهمت',
  },
]

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

// Phase 0 intent selector — the 6 tiles map to the existing
// (category × intent × marketplaceType) matrix. No new enums.
// The RIDES tile short-circuits to /rides/new because rides/delivery
// live on RideRequest, not Post.
interface AskIntentChoice {
  key: string
  // Display
  emoji: string
  titleAr: string; titleEn: string; titleUr: string
  subAr: string;   subEn: string;   subUr: string
  // Outcome — either a post mapping or a route hint.
  postMap?: { category: string; intent: 'REQUEST'; marketplaceType?: 'SELL' | 'BUY' | 'JOB' }
  route?: string
}
const ASK_INTENT_CHOICES: AskIntentChoice[] = [
  {
    key: 'product_buy',
    emoji: '🛒',
    titleAr: 'منتج للشراء',    titleEn: 'A product to buy', titleUr: 'خریدنے کیلئے سامان',
    subAr:  'أبحث عن منتج عند جيراني', subEn: 'Looking to buy something locally', subUr: 'محلے سے کچھ خریدنا',
    postMap: { category: 'MARKETPLACE', intent: 'REQUEST', marketplaceType: 'BUY' },
  },
  {
    key: 'service_need',
    emoji: '🔧',
    titleAr: 'أحتاج خدمة',     titleEn: 'I need a service', titleUr: 'مجھے خدمت چاہیے',
    subAr:  'سباك، كهربائي، مدرّسة…', subEn: 'Plumber, electrician, tutor…', subUr: 'پلمبر، الیکٹریشن، استاد…',
    postMap: { category: 'SERVICES', intent: 'REQUEST' },
  },
  {
    key: 'real_estate',
    emoji: '🏠',
    titleAr: 'أبحث عن عقار',   titleEn: 'Looking for property', titleUr: 'جائیداد ڈھونڈنا',
    subAr:  'شقة، فيلا، محل، مستودع', subEn: 'Apartment, villa, shop, warehouse', subUr: 'فلیٹ، ولا، دکان، گودام',
    postMap: { category: 'REAL_ESTATE', intent: 'REQUEST' },
  },
  {
    key: 'home_food',
    emoji: '🍱',
    titleAr: 'منتج أو أكل منزلي', titleEn: 'Home food / product', titleUr: 'گھریلو کھانا / مصنوعات',
    subAr:  'أبحث عن منتج بيتي محلي', subEn: 'Local home-cooked or handmade', subUr: 'مقامی گھریلو',
    postMap: { category: 'HOME_BUSINESSES', intent: 'REQUEST' },
  },
  {
    key: 'ride_delivery',
    emoji: '🚗',
    titleAr: 'مشوار أو توصيل',  titleEn: 'Ride or delivery', titleUr: 'سواری یا ڈیلیوری',
    subAr:  'يفتح صفحة المشاوير', subEn: 'Opens the rides surface', subUr: 'رائیڈز اسکرین کھولتا ہے',
    route: '/rides/new',
  },
  {
    key: 'recommendation',
    emoji: '💬',
    titleAr: 'توصية أو سؤال عام', titleEn: 'Recommendation or question', titleUr: 'سفارش یا سوال',
    subAr:  'وين أحسن مطعم/صيدلية/مكان', subEn: 'Best restaurant / clinic / place', subUr: 'بہترین جگہ کہاں؟',
    // GENERAL category becomes visible under the REQUESTS chip (which
    // filters by intent=REQUEST, not by category), so recommendation
    // asks reach neighbors without polluting category chips.
    postMap: { category: 'GENERAL', intent: 'REQUEST' },
  },
]

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
  const searchParams = useSearchParams()
  const { lang } = useLanguage()
  const { isOffline } = useNetworkStatus()

  // Deep-link target: /ask?intent=<key> pre-applies one of the intent
  // tiles on mount (same effect as tapping the tile manually). Used
  // by the feed empty-state CTAs — "Request service" lands here with
  // intent=service_need so the user starts on the right footing
  // without an extra tap. An invalid / missing intent falls through
  // to the default-category, no-intent state.
  const initialIntentKey = searchParams?.get('intent') || ''

  // Outside-neighborhood ask: /ask?neighborhood=<id> arrives from the
  // read-only feed banner. The post is then a REQUEST to a hood the user
  // doesn't live in — restricted to GENERAL / SERVICES, request-only.
  // The server independently enforces all of this; this just shapes the
  // UI so the user can't try a blocked path.
  const targetNeighborhoodId = searchParams?.get('neighborhood') || ''
  const isOutside = !!targetNeighborhoodId
  // Intent tiles allowed for outside asks (map to GENERAL / SERVICES).
  const OUTSIDE_INTENT_KEYS = ['service_need', 'recommendation']

  const [text, setText] = useState('')
  // Seed category/intent/marketplaceType from the URL deep-link if
  // one was provided, otherwise fall back to the existing defaults.
  const initialIntent = ASK_INTENT_CHOICES.find(
    (c) => c.key === initialIntentKey && c.postMap,
  )
  const [category, setCategory] = useState<string>(
    initialIntent?.postMap?.category ?? (isOutside ? 'GENERAL' : DEFAULT_CATEGORY),
  )
  // Track whether the user has explicitly overridden the suggested
  // category. Once they pick anything from the strip, we stop nudging
  // it on every keystroke — their choice is sacred. A URL deep-link
  // counts as an explicit override.
  const [userOverrode, setUserOverrode] = useState(!!initialIntent)
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  // Phase 0 intent selector — when set, locks category/intent/marketplaceType.
  // null = user hasn't picked a tile yet (or chose to clear it).
  const [intentChoice, setIntentChoice] = useState<string | null>(
    initialIntent?.key ?? null,
  )
  const [marketplaceType, setMarketplaceType] = useState<'SELL' | 'BUY' | 'JOB'>(
    initialIntent?.postMap?.marketplaceType ?? 'SELL',
  )

  function applyIntentChoice(choice: AskIntentChoice) {
    if (choice.route) {
      router.push(choice.route)
      return
    }
    if (!choice.postMap) return
    setIntentChoice(choice.key)
    setCategory(choice.postMap.category)
    setMarketplaceType(choice.postMap.marketplaceType ?? 'SELL')
    // Picking a tile is an explicit, intentional override. After this
    // the inference effect must NOT change the category from under the
    // user as they type.
    setUserOverrode(true)
    setShowCategoryPicker(false)
  }
  function clearIntentChoice() {
    setIntentChoice(null)
    setCategory(DEFAULT_CATEGORY)
    setMarketplaceType('SELL')
    setUserOverrode(false)
  }

  // v1 rule-based suggestion. Runs synchronously on every text change
  // (sub-millisecond). If the user has manually picked a category, we
  // do NOT overwrite their choice — only the auto-default is updated.
  useEffect(() => {
    // Outside asks are pinned to GENERAL/SERVICES — never auto-reroute
    // into a blocked category (the server would reject it anyway).
    if (userOverrode || isOutside) return
    const suggested = inferAskCategory(text)
    setCategory((prev) => (prev === suggested ? prev : suggested))
  }, [text, userOverrode, isOutside])
  const [location, setLocation] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [detectingLocation, setDetectingLocation] = useState(false)
  const [loading, setLoading] = useState(false)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)

  // Optional image attach. Same pattern as the regular post composer:
  // - pickImageOrFallback handles iOS native picker / Android WebView
  // - ImageSourceSheet shows the camera-vs-gallery chooser
  // - Hidden file inputs are the web fallback (Android pickImage routes
  //   here too via webInputRef)
  const [image, setImage] = useState<{ file: File; preview: string } | null>(null)
  const [imageSheetOpen, setImageSheetOpen] = useState(false)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

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

  // Revoke the blob URL when the image changes/unmounts so we don't
  // leak object URLs on the client.
  useEffect(() => {
    if (!image) return
    return () => {
      try { URL.revokeObjectURL(image.preview) } catch { /* ignore */ }
    }
  }, [image])

  function applyImage(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error(lang === 'en' ? 'Images only' : lang === 'ur' ? 'صرف تصاویر' : 'صور فقط')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(lang === 'en' ? 'Max 5MB' : lang === 'ur' ? 'زیادہ سے زیادہ 5MB' : 'الحد الأقصى 5 ميقا')
      return
    }
    if (image) {
      try { URL.revokeObjectURL(image.preview) } catch { /* ignore */ }
    }
    setImage({ file, preview: URL.createObjectURL(file) })
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) applyImage(file)
  }

  async function pickFromCamera() {
    const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()
    if (isNative) {
      try {
        const file = await pickImageFromCamera()
        applyImage(file)
      } catch (err: any) {
        if (!err?.message?.toLowerCase?.().includes('cancel') && err?.message !== 'no_image') {
          console.warn('[ask] camera failed', err)
        }
      }
    } else {
      cameraInputRef.current?.click()
    }
  }

  async function pickFromGallery() {
    // pickImagesOrFallback (multi capped at 1) goes straight to
    // PHPicker on iOS — no extra Apple "Take Photo / Photo Library"
    // sheet stacking on top of our ImageSourceSheet.
    const files = await pickImagesOrFallback(1, galleryInputRef)
    if (files[0]) applyImage(files[0])
  }

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
      // Upload image first if attached. Surfacing upload failures
      // BEFORE the post create keeps the post-create error path clean.
      let imageUrls: string[] = []
      if (image) {
        try {
          imageUrls = await uploadFiles([image.file])
        } catch (err: any) {
          playError()
          toast.error(
            lang === 'en' ? 'Image upload failed'
            : lang === 'ur' ? 'تصویر اپ لوڈ ناکام'
            : 'فشل رفع الصورة',
          )
          setLoading(false)
          return
        }
      }
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
          // marketplaceType is only meaningful when category=MARKETPLACE,
          // but the API safely ignores it otherwise. Sending it lets the
          // "product to buy" tile land as MARKETPLACE+BUY on first try.
          // OMITTED for outside asks — the server rejects any
          // marketplaceType on an outside request.
          ...(isOutside ? {} : { marketplaceType }),
          // Outside ask → target the browsed neighborhood; the server
          // marks it originScope=OUTSIDE_REQUEST and enforces the limits.
          ...(isOutside && targetNeighborhoodId ? { neighborhoodId: targetNeighborhoodId } : {}),
          imageUrls,
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
      // Meaningful-action trigger for the notification nudge.
      // All gates (mobile only, cooldown, snooze, no-overlay,
      // permission state) are evaluated inside the listener.
      try {
        window.dispatchEvent(new Event('hai:nudge-trigger'))
      } catch {
        // ignore
      }
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
          {isOutside ? translate('feed_outside_ask_cta', lang) : translate('ask_neighbors', lang)}
        </h1>
        <button
          data-guide="ask-submit"
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
        {/* Phase 0 intent selector — 6 tiles mapped to category × intent
            × marketplaceType. When null, the tiles take the top of the
            page. When picked, the tiles collapse into a single "selected"
            pill with a tap-to-change. The "Ride or delivery" tile
            short-circuits to /rides/new (no Post). */}
        {intentChoice === null ? (
          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
              {lang === 'en' ? 'What are you looking for?' : lang === 'ur' ? 'آپ کیا تلاش کر رہے ہیں؟' : 'وش تبي تلقى؟'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ASK_INTENT_CHOICES.filter((c) => !isOutside || OUTSIDE_INTENT_KEYS.includes(c.key)).map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => applyIntentChoice(c)}
                  className="flex items-start gap-2 text-start p-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 active:scale-[0.98] transition-transform"
                >
                  <span className="text-xl flex-shrink-0">{c.emoji}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-gray-900 dark:text-white leading-tight">
                      {lang === 'en' ? c.titleEn : lang === 'ur' ? c.titleUr : c.titleAr}
                    </span>
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
                      {lang === 'en' ? c.subEn : lang === 'ur' ? c.subUr : c.subAr}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
              {lang === 'en'
                ? "Or just start typing — we'll suggest a category."
                : lang === 'ur'
                  ? 'یا سیدھا لکھنا شروع کریں — ہم زمرہ تجویز کریں گے۔'
                  : 'أو ابدأ بالكتابة وسنقترح القسم تلقائياً.'}
            </p>
            {/* Directory chip — only renders when
                NEXT_PUBLIC_DIRECTORY_ENABLED='1'. Inert during pre-launch. */}
            <div className="mt-3">
              <DirectoryEntryCard variant="chip" />
            </div>
          </div>
        ) : (() => {
          const c = ASK_INTENT_CHOICES.find(x => x.key === intentChoice)
          if (!c) return null
          return (
            <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
              <span className="text-lg">{c.emoji}</span>
              <span className="flex-1 text-sm font-semibold text-primary-700 dark:text-primary-300 truncate">
                {lang === 'en' ? c.titleEn : lang === 'ur' ? c.titleUr : c.titleAr}
              </span>
              <button
                type="button"
                onClick={clearIntentChoice}
                className="text-[11px] font-semibold text-primary-700 dark:text-primary-300 underline-offset-2 hover:underline"
              >
                {lang === 'en' ? 'Change' : lang === 'ur' ? 'تبدیل کریں' : 'تغيير'}
              </button>
            </div>
          )
        })()}

        {/* Big input */}
        <textarea
          data-guide="ask-text"
          autoFocus={intentChoice !== null}
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
            override (sets userOverrode). Hidden for outside asks — the
            category is locked to GENERAL/SERVICES via the two tiles. */}
        {!isOutside && (
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
        )}

        {/* Optional image attach — same camera/gallery flow as the
            regular post composer. Single image (asks rarely benefit
            from a gallery). Hidden file inputs are the web fallback
            used by ImageSourceSheet's gallery branch and the on-device
            camera capture branch. */}
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-2">
            📷 {lang === 'en' ? 'Attach image (optional)' : lang === 'ur' ? 'تصویر شامل کریں (اختیاری)' : 'إرفاق صورة (اختياري)'}
          </label>
          {image ? (
            <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2">
              <img src={image.preview} alt="" className="w-16 h-16 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{image.file.name || 'image'}</p>
                <p className="text-[10px] text-gray-400">{(image.file.size / 1024).toFixed(0)} KB</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (image) URL.revokeObjectURL(image.preview)
                  setImage(null)
                }}
                className="text-gray-400 p-2 active:scale-90"
                aria-label="remove image"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setImageSheetOpen(true)}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl py-3 text-sm text-gray-400 hover:border-primary-300 hover:text-primary-500 transition-colors"
            >
              <FiImage className="w-4 h-4" />
              <span>{lang === 'en' ? 'Add a photo' : lang === 'ur' ? 'تصویر شامل کریں' : 'إضافة صورة'}</span>
            </button>
          )}
          <input ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageSelect} className="hidden" />
          <input ref={cameraInputRef}  type="file" accept="image/*" capture="environment" onChange={handleImageSelect} className="hidden" />
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
            🔎 {isOutside
              ? translate('feed_outside_helper', lang)
              : lang === 'en'
                ? 'Your question goes to neighbors in your area — they reply directly.'
                : lang === 'ur'
                  ? 'آپ کا سوال محلے کے پڑوسیوں کو جائے گا — وہ خود جواب دیں گے۔'
                  : 'سيُعرض سؤالك للجيران في حيّك — هم يردوا عليك مباشرة'}
          </p>
        </div>
      </div>

      <ImageSourceSheet
        open={imageSheetOpen}
        onClose={() => setImageSheetOpen(false)}
        onCamera={pickFromCamera}
        onGallery={pickFromGallery}
      />
      <ContextualGuide guideId="ask" steps={ASK_GUIDE_STEPS} />
    </main>
  )
}

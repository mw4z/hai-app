'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { FiArrowRight, FiArrowLeft, FiSend } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { useNetworkStatus, isOfflineError } from '@/lib/network'
import { translateApiError } from '@/lib/apiError'
import RiyalIcon from '@/components/RiyalIcon'
import { uploadFiles } from '@/lib/upload'
import { pickImagesOrFallback } from '@/lib/imagePicker'
import { getCurrentPositionSafe } from '@/lib/location/getCurrentPositionSafe'
import { playSuccess, playError } from '@/lib/sound'
import { FiX } from 'react-icons/fi'

// ── Draft storage ──────────────────────────────────────────────────────
// Saved to localStorage so the user's work survives closing the page.
// Raw File objects aren't serializable; only previously-uploaded image
// URLs are persisted.
const DRAFT_KEY = 'hai_post_draft'

interface PostDraft {
  category: string
  title: string
  body: string
  price: string
  location: { lat: number; lng: number; name: string } | null
  imageUrls: string[]
  savedAt: number
}

function loadDraft(): PostDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as PostDraft
    if (!d || typeof d !== 'object') return null
    return d
  } catch { return null }
}
function saveDraft(d: PostDraft) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch {}
}
function clearDraft() {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(DRAFT_KEY) } catch {}
}
function draftHasContent(d: PostDraft | null): boolean {
  if (!d) return false
  // Category selection alone doesn't count — user must have actually written
  // something (title/body/price) or attached media/location for the draft
  // prompt to be useful. Otherwise tapping a category and backing out would
  // incorrectly trigger the save/discard sheet.
  return !!(d.title.trim() || d.body.trim() || d.price || d.location || (d.imageUrls && d.imageUrls.length > 0))
}

const CATEGORIES = [
  {
    group: 'أخبار الحي',
    items: [
      { key: 'ALERT',             label: 'تنبيه أمني أو عام',     icon: '🔔', placeholder: 'مثال: انقطاع المياه في الشارع الرئيسي' },
      { key: 'NEIGHBORHOOD_ISSUE',label: 'مشكلة في الحي',          icon: '⚠️', placeholder: 'مثال: الشارع الجانبي مقطوع، أو تجاوز السرعة أمام المدرسة' },
      { key: 'LOST_FOUND',        label: 'مفقودات أو موجودات',     icon: '🔍', placeholder: 'مثال: وجدت مفاتيح عند المسجد' },
    ]
  },
  {
    group: 'طلبات',
    items: [
      { key: 'RIDE_REQUEST', label: 'طلب مشوار',             icon: '🚗', placeholder: '' },
      { key: 'LOOKING_FOR',  label: 'أبحث عن...',            icon: '🔎', placeholder: 'مثال: أبحث عن معلمة تأسيس، أو سباك موثوق، أو شقة للإيجار' },
    ]
  },
  {
    group: 'بيع وخدمات',
    items: [
      { key: 'MARKETPLACE',  label: 'بيع / شراء',             icon: '🛒', placeholder: 'مثال: للبيع جهاز تكييف مستعمل بحالة ممتازة' },
      { key: 'FOOD_HOME',    label: 'الأسر المنتجة',          icon: '🍱', placeholder: 'مثال: متوفر اليوم كبسة دجاج وسمبوسة — الطلب على الخاص' },
      { key: 'REAL_ESTATE',  label: 'عقارات (إيجار أو بيع)', icon: '🏠', placeholder: 'مثال: شقة للإيجار في حي الزايدي — 3 غرف — التواصل على الخاص' },
      { key: 'SERVICES',     label: 'خدمة (سباك، كهربائي...)', icon: '🔧',placeholder: 'مثال: فني تكييف — خبرة 10 سنوات — يخدم حي الزايدي' },
    ]
  },
  {
    group: 'مجتمع',
    items: [
      { key: 'MOSQUE',       label: 'إعلان مسجد',             icon: '🕌', placeholder: 'مثال: دروس تحفيظ قرآن للنساء بعد صلاة المغرب' },
      { key: 'EID_RAMADAN',  label: 'فعاليات ومناسبات',       icon: '🎉', placeholder: 'مثال: توزيع إفطار رمضان عند مسجد الحي الساعة 6' },
      { key: 'GENERAL',      label: 'عام',                    icon: '💬', placeholder: 'مثال: شكراً لمن أعاد محفظتي...' },
    ]
  },
]

const WOMEN_ONLY_GROUP = {
  group: 'خاص',
  items: [
    { key: 'WOMEN_ONLY', label: 'للنساء فقط', icon: '👩', placeholder: 'مثال: توصية طبيبة، أو خدمة نسائية' },
  ]
}

const ALL_ITEMS = CATEGORIES.flatMap(g => g.items)

export default function NewPostPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // SUPER_ADMIN deep-link target: /post/new?neighborhood=<id> pre-selects
  // that neighborhood in the picker once the list has loaded.
  const initialNeighborhoodParam = searchParams?.get('neighborhood') || ''
  const { lang } = useLanguage()
  const [step, setStep] = useState<'category' | 'content'>('category')
  const [category, setCategory] = useState('')
  const [isFemale, setIsFemale] = useState(false)
  // Only visible providers (ACTIVE/VERIFIED) may post in the SERVICES category.
  const [canPostServices, setCanPostServices] = useState(false)
  // SUPER_ADMIN can post into any neighborhood. For everyone else this
  // stays false and the server pins the post to their own neighborhood.
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [ownNeighborhoodId, setOwnNeighborhoodId] = useState<string | null>(null)
  const [allNeighborhoods, setAllNeighborhoods] = useState<{ id: string; name: string; nameEn?: string; cityName?: string }[]>([])
  const [targetNeighborhoodId, setTargetNeighborhoodId] = useState<string>('')

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(d => {
      if (d.gender === 'FEMALE') setIsFemale(true)
      if (d.providerStatus === 'ACTIVE' || d.providerStatus === 'VERIFIED') {
        setCanPostServices(true)
      }
      if (d.role === 'SUPER_ADMIN') {
        setIsSuperAdmin(true)
        if (d.neighborhoodId) {
          setOwnNeighborhoodId(d.neighborhoodId)
          setTargetNeighborhoodId(d.neighborhoodId)
        }
      }
    }).catch(() => {})
  }, [])

  // Super-admins: lazy-load the full neighborhood list once so they can
  // pick any target neighborhood from a dropdown. If a ?neighborhood=<id>
  // was passed in the URL (e.g. from the feed's + button while browsing
  // another neighborhood), pre-select it once the list lands.
  useEffect(() => {
    if (!isSuperAdmin || allNeighborhoods.length > 0) return
    fetch('/api/neighborhoods/all')
      .then(r => r.json())
      .then((data: any[]) => {
        if (!Array.isArray(data)) return
        const list = data.map(n => ({ id: n.id, name: n.name, nameEn: n.nameEn, cityName: n.cityName }))
        setAllNeighborhoods(list)
        if (initialNeighborhoodParam && list.some(n => n.id === initialNeighborhoodParam)) {
          setTargetNeighborhoodId(initialNeighborhoodParam)
        }
      })
      .catch(() => {})
  }, [isSuperAdmin, allNeighborhoods.length, initialNeighborhoodParam])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [price, setPrice] = useState('')
  const [images, setImages] = useState<{ file: File; preview: string; url?: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const { isOffline } = useNetworkStatus()
  const [location, setLocation] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [detectingLocation, setDetectingLocation] = useState(false)

  // Draft state — if a saved draft exists, offer to restore it on mount.
  const [draftAvailable, setDraftAvailable] = useState<PostDraft | null>(null)
  const [showLeaveSheet, setShowLeaveSheet] = useState(false)

  useEffect(() => {
    const d = loadDraft()
    if (draftHasContent(d)) setDraftAvailable(d)
  }, [])

  // Mark the body as full-screen so globals.css swaps the template's
  // translate slide for a pure opacity crossfade. The slide's transform
  // creates a containing block that would briefly reparent this page's
  // `fixed inset-0` <main> during the 280ms animation, making the
  // whole form look broken on route-in.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.setAttribute('data-full-screen', 'true')
    return () => { document.body.removeAttribute('data-full-screen') }
  }, [])

  function restoreDraft(d: PostDraft) {
    setCategory(d.category || '')
    setTitle(d.title || '')
    setBody(d.body || '')
    setPrice(d.price || '')
    setLocation(d.location || null)
    // Rehydrate images from uploaded URLs only — raw File objects can't
    // be persisted, so previews from the previous session are lost.
    setImages(
      (d.imageUrls || []).map((url) => ({
        file: new File([], 'restored'),
        preview: url,
        url,
      })),
    )
    if (d.category) setStep('content')
    setDraftAvailable(null)
  }

  function currentDraft(): PostDraft {
    return {
      category,
      title,
      body,
      price,
      location,
      imageUrls: images.map(i => i.url).filter((u): u is string => !!u),
      savedAt: Date.now(),
    }
  }
  function hasUnsavedContent(): boolean {
    return draftHasContent(currentDraft())
  }

  function handleBack() {
    if (!hasUnsavedContent()) { router.push('/feed'); return }
    setShowLeaveSheet(true)
  }
  function handleSaveAndLeave() {
    saveDraft(currentDraft())
    setShowLeaveSheet(false)
    router.push('/feed')
  }
  function handleDiscardAndLeave() {
    clearDraft()
    setShowLeaveSheet(false)
    router.push('/feed')
  }

  // SERVICES is hidden from NORMAL users (and PENDING providers) — posting in
  // SERVICES is reserved for publicly-visible providers (ACTIVE/VERIFIED).
  const hideServices = !canPostServices
  const baseCategories = hideServices
    ? CATEGORIES.map(g => ({ ...g, items: g.items.filter(i => i.key !== 'SERVICES') }))
                .filter(g => g.items.length > 0)
    : CATEGORIES
  const baseItems = baseCategories.flatMap(g => g.items)

  const allItems = isFemale ? [...baseItems, ...WOMEN_ONLY_GROUP.items] : baseItems
  const categoryGroups = isFemale ? [...baseCategories, WOMEN_ONLY_GROUP] : baseCategories
  const selected = allItems.find(i => i.key === category)
  const isLookingFor = category === 'LOOKING_FOR'
  const showPrice = ['MARKETPLACE', 'REAL_ESTATE', 'FOOD_HOME'].includes(category)

  const imageInputRef = useRef<HTMLInputElement>(null)

  function applyPostImages(files: File[]) {
    const remaining = 5 - images.length
    const toAdd = files.slice(0, remaining)
    for (const file of toAdd) {
      if (file.size > 10 * 1024 * 1024) { toast.error('حجم الصورة كبير (أقصى 10 ميقا)'); continue }
      if (!file.type.startsWith('image/')) { toast.error('نوع غير مدعوم'); continue }
      const preview = URL.createObjectURL(file)
      setImages(prev => [...prev, { file, preview }])
    }
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    applyPostImages(files)
  }

  async function openPostImagePicker() {
    const remaining = 5 - images.length
    if (remaining <= 0) return
    const files = await pickImagesOrFallback(remaining, imageInputRef)
    if (files.length > 0) applyPostImages(files)
  }

  function removeImage(index: number) {
    setImages(prev => { URL.revokeObjectURL(prev[index].preview); return prev.filter((_, i) => i !== index) })
  }

  async function uploadImages(): Promise<string[] | null> {
    if (images.length === 0) return []
    setUploading(true)
    try {
      return await uploadFiles(images.map(img => img.file))
    } catch (err: any) {
      toast.error(err?.message || 'فشل رفع الصور')
      return null
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit() {
    if (loading || uploading) return // Prevent double-submit
    if (!title.trim() || !body.trim()) {
      const missing =
        !title.trim() && !body.trim() ? 'both'
          : !title.trim() ? 'title'
          : 'body'
      toast.error(
        lang === 'en'
          ? missing === 'title'
            ? 'Please add a title.'
            : missing === 'body'
              ? 'Please add details in the body.'
              : 'Please add a title and details.'
          : lang === 'ur'
            ? missing === 'title'
              ? 'عنوان درج کریں۔'
              : missing === 'body'
                ? 'تفصیل درج کریں۔'
                : 'عنوان اور تفصیل دونوں درج کریں۔'
            : missing === 'title'
              ? 'أدخل عنواناً للمنشور.'
              : missing === 'body'
                ? 'أدخل تفاصيل المنشور.'
                : 'أدخل العنوان والتفاصيل.',
      )
      return
    }
    if (!category) {
      toast.error(lang === 'en' ? 'Select a category' : 'اختر نوع المنشور')
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
      // Upload images first — abort if upload fails
      const imageUrls = await uploadImages()
      if (imageUrls === null) { setLoading(false); return }

      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          category,
          price: price ? parseFloat(price) : null,
          imageUrls,
          locationLat: location?.lat || null,
          locationLng: location?.lng || null,
          locationName: location?.name || null,
          // Server enforces: only SUPER_ADMIN may override neighborhoodId.
          // For everyone else this field is ignored.
          ...(isSuperAdmin && targetNeighborhoodId && targetNeighborhoodId !== ownNeighborhoodId
            ? { neighborhoodId: targetNeighborhoodId }
            : {}),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        playError()
        // Surface the server's specific reason (category invalid, missing
        // fields, rate-limit, content blocked, duplicate, etc.) instead of
        // the generic fallback. 4.5s so the user can actually read it.
        toast.error(translateApiError(data, lang as 'ar' | 'en' | 'ur'), {
          duration: 4500,
        })
        return
      }

      playSuccess()
      toast.success('تم نشر منشورك!')
      clearDraft()
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
      {/* Header — first flex child, naturally fixed at top; content area
          below it scrolls. fixed inset-0 on main ignores body's global
          safe-area padding so the page owns the full viewport. */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-4 border-b border-gray-100 dark:border-gray-700"
           style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
        {step === 'content' ? (
          <button onClick={() => setStep('category')} className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 py-1">
            {lang !== 'en' ? <FiArrowRight className="w-5 h-5" /> : <FiArrowLeft className="w-5 h-5" />}
            <span className="text-sm font-medium">{lang === 'en' ? 'Back' : lang === 'ur' ? 'واپس' : 'رجوع'}</span>
          </button>
        ) : (
          <button onClick={handleBack} className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 py-1">
            {lang !== 'en' ? <FiArrowRight className="w-5 h-5" /> : <FiArrowLeft className="w-5 h-5" />}
            <span className="text-sm font-medium">{lang === 'en' ? 'Cancel' : lang === 'ur' ? 'منسوخ' : 'إلغاء'}</span>
          </button>
        )}
        <h1 className="flex-1 text-center font-bold text-gray-900 dark:text-white">منشور جديد</h1>
        {step === 'content' && (
          <button
            onClick={handleSubmit}
            disabled={loading || uploading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary-600 text-white font-bold text-sm shadow-md active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
            style={{
              boxShadow: '0 4px 12px -2px rgba(0, 109, 87, 0.45), 0 2px 4px -1px rgba(0, 0, 0, 0.12)',
            }}
          >
            {!loading && !uploading && <FiSend className="w-4 h-4" />}
            <span>
              {uploading
                ? (lang === 'en' ? 'Uploading…' : lang === 'ur' ? 'اپ لوڈ…' : 'رفع الصور…')
                : loading
                  ? (lang === 'en' ? 'Publishing…' : lang === 'ur' ? 'شائع…' : 'جاري النشر…')
                  : (lang === 'en' ? 'Publish' : lang === 'ur' ? 'شائع کریں' : 'نشر')}
            </span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">

        {/* Draft-restore banner — inline at the top of the scroll area so it
            sits above the list without overlapping. Shown on mount if an
            unsaved draft exists. */}
        {draftAvailable && (
          <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 px-4 py-3 flex items-start gap-3">
            <span className="text-base leading-none mt-0.5">📝</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">
                {lang === 'en' ? 'You have a saved draft' : lang === 'ur' ? 'آپ کا محفوظ شدہ مسودہ ہے' : 'لديك مسودة محفوظة'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => restoreDraft(draftAvailable)}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold active:scale-95 transition-transform"
                >
                  {lang === 'en' ? 'Restore' : lang === 'ur' ? 'بحال کریں' : 'استرجاع'}
                </button>
                <button
                  onClick={() => { clearDraft(); setDraftAvailable(null) }}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 text-amber-700 dark:text-amber-300 text-xs font-medium border border-amber-200 dark:border-amber-700 active:scale-95 transition-transform"
                >
                  {lang === 'en' ? 'Discard' : lang === 'ur' ? 'ہٹا دیں' : 'تجاهل'}
                </button>
              </div>
            </div>
            <button onClick={() => setDraftAvailable(null)} className="text-amber-700/70 dark:text-amber-300/70 p-0.5" aria-label="dismiss">
              <FiX className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 1: Category */}
        {step === 'category' && (
          <div className="space-y-5 pb-24" data-tour="post-categories" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>
            <p className="text-gray-500 dark:text-gray-400 text-sm">اختر نوع المنشور</p>
            {categoryGroups.map((group) => (
              <div key={group.group}>
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-2">{group.group}</p>
                <div className="space-y-2">
                  {group.items.map((cat: any) => (
                    <button
                      key={cat.key}
                      onClick={() => {
                        // RIDE_REQUEST goes directly to the structured ride form
                        if (cat.key === 'RIDE_REQUEST') { router.push('/rides/new'); return }
                        setCategory(cat.key); setStep('content')
                      }}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-xl border active:scale-[0.98] transition-transform text-start ${
                        cat.highlight
                          ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <span className="text-xl w-8 text-center">{cat.icon}</span>
                      <span className={`flex-1 font-medium text-sm ${cat.highlight ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-800 dark:text-white'}`}>{cat.label}</span>
                      {cat.highlight && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white">
                          {lang === 'en' ? 'NEW' : lang === 'ur' ? 'نیا' : 'جديد'}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 2: Content */}
        {step === 'content' && selected && (
          <div className="space-y-4" data-tour="post-content">
            {/* Selected type badge */}
            <div className="flex items-center gap-2 bg-primary-50 dark:bg-primary-900/30 rounded-xl px-3 py-2">
              <span>{selected.icon}</span>
              <span className="text-primary-700 dark:text-primary-300 font-medium text-sm">{selected.label}</span>
            </div>

            {/* SUPER_ADMIN — target neighborhood picker. Lets platform
                owners publish into any neighborhood, not just their own. */}
            {isSuperAdmin && allNeighborhoods.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-3 space-y-2">
                <label className="block text-xs font-semibold text-amber-900 dark:text-amber-200">
                  {lang === 'en' ? 'Target neighborhood (Super Admin)' : 'الحي المستهدف (مشرف عام)'}
                </label>
                <select
                  value={targetNeighborhoodId}
                  onChange={(e) => setTargetNeighborhoodId(e.target.value)}
                  className="input-field text-sm"
                >
                  {allNeighborhoods.map((n) => (
                    <option key={n.id} value={n.id}>
                      {(lang === 'en' && n.nameEn ? n.nameEn : n.name)}
                      {n.cityName ? ` — ${n.cityName}` : ''}
                      {n.id === ownNeighborhoodId ? (lang === 'en' ? ' (yours)' : ' (حيّك)') : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* For LOOKING_FOR: simplified single field */}
            {isLookingFor ? (
              <>
                <input
                  type="text"
                  placeholder="أبحث عن..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input-field font-semibold"
                  autoFocus
                  maxLength={100}
                />
                <textarea
                  placeholder="اكتب تفاصيل أكثر — المنطقة، الميزانية، أي تفاصيل تساعد الجيران يجاوبوك..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="input-field resize-none"
                  rows={4}
                  maxLength={500}
                />
                <div className="bg-sky-50 dark:bg-sky-900/30 rounded-xl p-3">
                  <p className="text-sky-700 dark:text-sky-300 text-xs">
                    🔎 سيُعرض طلبك للجيران في حيّك — هم يردوا عليك مباشرة
                  </p>
                </div>

                {/* Image picker */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">📷 {lang === 'en' ? 'Add photos (optional)' : lang === 'ur' ? 'تصاویر شامل کریں (اختیاری)' : 'إضافة صور (اختياري)'}</label>
                    <span className="text-xs text-gray-400">{images.length}/5</span>
                  </div>

                  {images.length > 0 && (
                    <div className="flex gap-2 mb-2 overflow-x-auto">
                      {images.map((img, i) => (
                        <div key={i} className="relative flex-shrink-0">
                          <img src={img.preview} alt="" className="w-20 h-20 object-cover rounded-xl border border-gray-200 dark:border-gray-700" />
                          <button type="button" onClick={() => removeImage(i)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {images.length < 5 && (
                    <>
                      <button
                        type="button"
                        onClick={openPostImagePicker}
                        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl py-3 text-sm text-gray-400 cursor-pointer hover:border-primary-300 hover:text-primary-500 transition-colors"
                      >
                        <span>+ {lang === 'en' ? 'Choose photo' : lang === 'ur' ? 'تصویر منتخب کریں' : 'اختر صورة'}</span>
                      </button>
                      <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImageSelect} className="hidden" />
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="العنوان"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input-field font-semibold"
                  autoFocus
                  maxLength={100}
                />
                <textarea
                  placeholder={selected.placeholder}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="input-field resize-none"
                  rows={5}
                  maxLength={1000}
                />

                {/* Contextual hint */}
                {!body && (
                  <p className="text-xs text-gray-400 -mt-2 px-1">
                    {['ALERT', 'NEIGHBORHOOD_ISSUE'].includes(category)
                      ? '💡 حدد الموقع أو الشارع لمساعدة الجيران بالتعرف على المشكلة'
                      : ['LOOKING_FOR', 'SERVICES'].includes(category)
                      ? '💡 اذكر المنطقة والميزانية لردود أسرع'
                      : ['LOST_FOUND'].includes(category)
                      ? '💡 اذكر المكان والوقت اللي شفت فيه الشيء'
                      : ['MARKETPLACE', 'FOOD_HOME', 'REAL_ESTATE'].includes(category)
                      ? '💡 اذكر السعر والحالة لجذب المشترين'
                      : null}
                  </p>
                )}

                {/* Price field */}
                {showPrice && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      السعر {category === 'FOOD_HOME' ? '(للطلب الواحد)' : ''}
                    </label>
                    <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-primary-500">
                      <span className="px-3 text-gray-500 dark:text-gray-400 text-sm border-l border-gray-200 dark:border-gray-700 py-3"><RiyalIcon /></span>
                      <input
                        type="number"
                        placeholder="0"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="flex-1 px-3 py-3 bg-transparent focus:outline-none text-start text-gray-900 dark:text-white"
                        dir="ltr"
                      />
                    </div>
                  </div>
                )}

                {/* Image picker */}
                <div data-tour="post-images">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">📷 إضافة صور</label>
                    <span className="text-xs text-gray-400">{images.length}/5</span>
                  </div>

                  {images.length > 0 && (
                    <div className="flex gap-2 mb-2 overflow-x-auto">
                      {images.map((img, i) => (
                        <div key={i} className="relative flex-shrink-0">
                          <img src={img.preview} alt="" className="w-20 h-20 object-cover rounded-xl border border-gray-200 dark:border-gray-700" />
                          <button
                            type="button"
                            onClick={() => removeImage(i)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {images.length < 5 && (
                    <>
                      <button
                        type="button"
                        onClick={openPostImagePicker}
                        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl py-3 text-sm text-gray-400 cursor-pointer hover:border-primary-300 hover:text-primary-500 transition-colors"
                      >
                        <span>+ {lang === 'en' ? 'Choose photo' : lang === 'ur' ? 'تصویر منتخب کریں' : 'اختر صورة'}</span>
                      </button>
                      <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImageSelect} className="hidden" />
                    </>
                  )}
                </div>

                {/* Location attachment */}
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

                {/* Issue tip */}
                {category === 'NEIGHBORHOOD_ISSUE' && (
                  <div className="bg-orange-50 dark:bg-orange-900/30 rounded-xl p-3">
                    <p className="text-orange-700 dark:text-orange-300 text-xs">
                      ⚠️ سيتم إشعار مشرف الحي بالمشكلة — كن دقيقاً في الوصف والموقع
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Leave-page sheet — save draft or discard */}
      {showLeaveSheet && (
        <div
          className="fixed inset-0 z-[1000] bg-black/40 flex items-end justify-center"
          onClick={() => setShowLeaveSheet(false)}
        >
          <div
            className="w-full max-w-[480px] bg-white dark:bg-gray-800 rounded-t-3xl p-4 space-y-2 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
          >
            <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-3" />
            <p className="text-center text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
              {lang === 'en' ? 'Save your changes?' : lang === 'ur' ? 'تبدیلیاں محفوظ کریں؟' : 'هل تريد حفظ التعديلات؟'}
            </p>
            <p className="text-center text-[11px] text-gray-500 dark:text-gray-400 mb-3 px-2 leading-snug">
              {lang === 'en' ? 'Your work will be available next time you open the new post screen.' : lang === 'ur' ? 'اگلی بار یہاں آنے پر آپ کا کام دستیاب ہوگا۔' : 'ستجد ما كتبت عند فتح المنشور الجديد مرة أخرى.'}
            </p>
            <button
              onClick={handleSaveAndLeave}
              className="w-full py-3 rounded-xl bg-primary-600 text-white text-sm font-semibold active:scale-95 transition-transform"
            >
              {lang === 'en' ? 'Save as draft' : lang === 'ur' ? 'مسودے میں محفوظ کریں' : 'حفظ كمسودة'}
            </button>
            <button
              onClick={handleDiscardAndLeave}
              className="w-full py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-semibold active:scale-95 transition-transform"
            >
              {lang === 'en' ? 'Discard changes' : lang === 'ur' ? 'تبدیلیاں ہٹائیں' : 'تجاهل التعديلات'}
            </button>
            <button
              onClick={() => setShowLeaveSheet(false)}
              className="w-full py-3 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400"
            >
              {lang === 'en' ? 'Continue editing' : lang === 'ur' ? 'ترمیم جاری رکھیں' : 'متابعة التعديل'}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

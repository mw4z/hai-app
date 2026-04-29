'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiArrowRight, FiArrowLeft, FiSend } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { useNetworkStatus } from '@/lib/network'
import { translateApiError } from '@/lib/apiError'
import RiyalIcon from '@/components/RiyalIcon'
import { uploadFiles } from '@/lib/upload'
import { pickImagesOrFallback, pickImageFromCamera } from '@/lib/imagePicker'
import ImageSourceSheet from '@/components/ImageSourceSheet'
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
  return !!(d.title.trim() || d.body.trim() || d.price || d.location || (d.imageUrls && d.imageUrls.length > 0))
}

// ── v2 categories (PostCategory) ─────────────────────────────────────
// Single flat list of the 9 user-facing v2 buckets. GENERAL is admin-
// only fallback and is intentionally not exposed here. RIDES routes to
// the structured /rides/new flow because requesting a ride uses a
// dedicated form; the rest land in this composer's content step.
interface CategoryItem {
  key: string
  label: string
  labelEn: string
  labelUr: string
  icon: string
  placeholder: string
  placeholderEn: string
  placeholderUr: string
}

// Order is UX-driven (real frequency of use), NOT alphabetical and NOT
// enum order. Layout reads as a 3-column grid:
//
//   Row 1 — core / highest frequency:        MARKETPLACE   SERVICES        HOME_BUSINESSES
//   Row 2 — daily needs:                     RIDES         REAL_ESTATE
//   Row 3 — important / urgent:              NEIGHBORHOOD_REPORTS  LOST_FOUND
//   Row 4 — social / optional:               EVENTS        COMPETITIONS
//
// Rows 2-4 will appear with 2 cells side-by-side — the grid auto-flows
// inside `.hai-option-grid-3` so the visual rhythm is preserved.
const CATEGORIES: CategoryItem[] = [
  // Row 1
  {
    key: 'MARKETPLACE',
    label: 'السوق',
    labelEn: 'Marketplace',
    labelUr: 'مارکیٹ',
    icon: '🛒',
    placeholder: 'مثال: للبيع جهاز تكييف مستعمل بحالة ممتازة',
    placeholderEn: 'Example: Used AC for sale — excellent condition',
    placeholderUr: 'مثال: استعمال شدہ اے سی برائے فروخت — بہترین حالت',
  },
  {
    key: 'SERVICES',
    label: 'خدمات',
    labelEn: 'Services',
    labelUr: 'خدمات',
    icon: '🔧',
    placeholder: 'مثال: فني تكييف — خبرة 10 سنوات — يخدم الحي',
    placeholderEn: 'Example: AC technician — 10y experience — serves the area',
    placeholderUr: 'مثال: اے سی ٹیکنیشن — 10 سال تجربہ — محلے میں خدمت',
  },
  {
    key: 'HOME_BUSINESSES',
    label: 'الأسر المنتجة',
    labelEn: 'Home Businesses',
    labelUr: 'گھریلو کاروبار',
    icon: '🍱',
    placeholder: 'مثال: متوفر اليوم كبسة دجاج وسمبوسة — الطلب على الخاص',
    placeholderEn: 'Example: Today: chicken kabsa and samosa — order via DM',
    placeholderUr: 'مثال: آج چکن کبسہ اور سموسے دستیاب — آرڈر ڈی ایم پر',
  },
  // Row 2
  {
    key: 'RIDES',
    label: 'مشاوير',
    labelEn: 'Rides',
    labelUr: 'سواری',
    icon: '🚗',
    placeholder: '',
    placeholderEn: '',
    placeholderUr: '',
  },
  {
    key: 'REAL_ESTATE',
    label: 'عقارات',
    labelEn: 'Real Estate',
    labelUr: 'جائیداد',
    icon: '🏠',
    placeholder: 'مثال: شقة للإيجار — 3 غرف — التواصل على الخاص',
    placeholderEn: 'Example: Apartment for rent — 3 bedrooms — DM to contact',
    placeholderUr: 'مثال: کرائے کیلئے فلیٹ — 3 کمرے — رابطہ ڈی ایم پر',
  },
  // Row 3
  {
    key: 'NEIGHBORHOOD_REPORTS',
    label: 'بلاغات الحي',
    labelEn: 'Neighborhood Reports',
    labelUr: 'محلے کی رپورٹس',
    icon: '⚠️',
    placeholder: 'مثال: انقطاع المياه في الشارع الرئيسي',
    placeholderEn: 'Example: Water outage on main street',
    placeholderUr: 'مثال: مین سٹریٹ پر پانی کی بندش',
  },
  {
    key: 'LOST_FOUND',
    label: 'مفقودات',
    labelEn: 'Lost & Found',
    labelUr: 'گمشدہ اشیاء',
    icon: '🔍',
    placeholder: 'مثال: وجدت مفاتيح عند المسجد',
    placeholderEn: 'Example: Found keys near the mosque',
    placeholderUr: 'مثال: مسجد کے پاس چابیاں ملی ہیں',
  },
  // Row 4
  {
    key: 'EVENTS',
    label: 'فعاليات ومناسبات',
    labelEn: 'Events',
    labelUr: 'تقریبات',
    icon: '🎉',
    placeholder: 'مثال: توزيع إفطار رمضان عند مسجد الحي الساعة 6',
    placeholderEn: 'Example: Ramadan iftar distribution at the mosque at 6pm',
    placeholderUr: 'مثال: محلے کی مسجد پر شام 6 بجے افطار کی تقسیم',
  },
  {
    key: 'COMPETITIONS',
    label: 'مسابقات وجوائز',
    labelEn: 'Competitions',
    labelUr: 'مقابلے',
    icon: '🏆',
    placeholder: 'مثال: مسابقة حفظ القرآن للأطفال — جوائز قيمة',
    placeholderEn: 'Example: Quran memorization contest for kids — great prizes',
    placeholderUr: 'مثال: بچوں کیلئے قرآن حفظ کا مقابلہ — قیمتی انعامات',
  },
]

// Categories that should show the price field in the content step.
const PRICE_CATEGORIES = new Set(['MARKETPLACE', 'REAL_ESTATE', 'HOME_BUSINESSES'])
// Server-side, COMPETITIONS posts are admin-only — surface this to the
// user by hiding the entry instead of showing an error after submit.
const ADMIN_ONLY_CATEGORIES = new Set(['COMPETITIONS'])

export default function NewPostPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // SUPER_ADMIN deep-link target: /post/new?neighborhood=<id> pre-selects
  // that neighborhood in the picker once the list has loaded.
  const initialNeighborhoodParam = searchParams?.get('neighborhood') || ''
  const { lang } = useLanguage()
  const [step, setStep] = useState<'category' | 'content'>('category')
  const [category, setCategory] = useState('')
  // Only visible providers (ACTIVE/VERIFIED) may post in the SERVICES category.
  const [canPostServices, setCanPostServices] = useState(false)
  // SUPER_ADMIN can post into any neighborhood and any category.
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [isAdminLike, setIsAdminLike] = useState(false)
  // Tracks whether the /api/profile fetch has resolved. While false,
  // we never hide cells — the grid renders all 9 categories from the
  // first paint so it doesn't shift under the user when the profile
  // gate finally loads. Validation moves to onClick instead.
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [ownNeighborhoodId, setOwnNeighborhoodId] = useState<string | null>(null)
  const [allNeighborhoods, setAllNeighborhoods] = useState<{ id: string; name: string; nameEn?: string; cityName?: string }[]>([])
  const [targetNeighborhoodId, setTargetNeighborhoodId] = useState<string>('')

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(d => {
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
      if (['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD'].includes(d.role)) {
        setIsAdminLike(true)
      }
    })
      .catch(() => {})
      .finally(() => setProfileLoaded(true))
  }, [])

  // Super-admins: lazy-load the full neighborhood list once.
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

  // Draft state
  const [draftAvailable, setDraftAvailable] = useState<PostDraft | null>(null)
  const [showLeaveSheet, setShowLeaveSheet] = useState(false)

  useEffect(() => {
    const d = loadDraft()
    if (draftHasContent(d)) setDraftAvailable(d)
  }, [])

  // Mark the body as full-screen so globals.css swaps the template's
  // translate slide for a pure opacity crossfade.
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

  // Always render all 9 cells so the grid layout is stable from the
  // first paint. Validation now happens on click (see onCategoryTap
  // below), gated by `profileLoaded` — a user tapping a restricted
  // cell after the profile loads gets a toast; before profile loads
  // the tap proceeds and the server-side check is the safety net.
  const visibleCategories = CATEGORIES

  const isCategoryRestricted = (key: string): boolean => {
    if (!profileLoaded) return false
    if (key === 'SERVICES' && !canPostServices && !isAdminLike) return true
    if (ADMIN_ONLY_CATEGORIES.has(key) && !isAdminLike) return true
    return false
  }

  const selected = CATEGORIES.find(i => i.key === category)
  const showPrice = PRICE_CATEGORIES.has(category)

  const imageInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [showImageSheet, setShowImageSheet] = useState(false)

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
    setShowImageSheet(true)
  }

  async function pickFromCamera() {
    const remaining = 5 - images.length
    if (remaining <= 0) return
    const isNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.()
    if (isNative) {
      try {
        const file = await pickImageFromCamera()
        applyPostImages([file])
      } catch (err: any) {
        if (!err?.message?.toLowerCase?.().includes('cancel') && err?.message !== 'no_image') {
          console.warn('[post/new] camera failed', err)
        }
      }
    } else {
      cameraInputRef.current?.click()
    }
  }

  async function pickFromGallery() {
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
    if (loading || uploading) return
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
      const imageUrls = await uploadImages()
      if (imageUrls === null) { setLoading(false); return }

      // The composer always sends a v2 PostCategory enum value. The
      // /api/posts route detects v2 vs legacy and runs both through
      // classifyPost — never duplicate the mapping logic here.
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
          ...(isSuperAdmin && targetNeighborhoodId && targetNeighborhoodId !== ownNeighborhoodId
            ? { neighborhoodId: targetNeighborhoodId }
            : {}),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        playError()
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

  const labelOf = (c: CategoryItem) =>
    lang === 'en' ? c.labelEn : lang === 'ur' ? c.labelUr : c.label
  const placeholderOf = (c: CategoryItem) =>
    lang === 'en' ? c.placeholderEn : lang === 'ur' ? c.placeholderUr : c.placeholder

  return (
    <main className="fixed inset-0 flex flex-col bg-white dark:bg-gray-900 z-10">
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
        <h1 className="flex-1 text-center font-bold text-gray-900 dark:text-white">
          {lang === 'en' ? 'New Post' : lang === 'ur' ? 'نئی پوسٹ' : 'منشور جديد'}
        </h1>
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

        {/* Draft-restore banner */}
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

        {/* Step 1: Category — flat 3-column grid of v2 buckets. */}
        {step === 'category' && (
          <div className="space-y-4 pb-24" data-tour="post-categories" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {lang === 'en' ? 'Choose a category' : lang === 'ur' ? 'زمرہ منتخب کریں' : 'اختر نوع المنشور'}
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              {visibleCategories.map((cat) => {
                const restricted = isCategoryRestricted(cat.key)
                return (
                  <button
                    key={cat.key}
                    onClick={() => {
                      if (restricted) {
                        // Tell the user why they can't pick this. The
                        // server-side check is the canonical guard;
                        // this is just UX feedback.
                        if (cat.key === 'SERVICES') {
                          toast.error(lang === 'en'
                            ? 'Services posts are for verified providers only'
                            : lang === 'ur'
                              ? 'خدمات کی پوسٹس صرف تصدیق شدہ خدمات فراہم کرنے والوں کیلئے'
                              : 'هذا القسم متاح فقط لمقدمي الخدمات')
                        } else {
                          toast.error(lang === 'en'
                            ? 'Admin-only category'
                            : lang === 'ur'
                              ? 'صرف منتظمین کیلئے'
                              : 'هذا القسم متاح فقط للمشرفين')
                        }
                        return
                      }
                      // RIDES routes to the structured ride form — same
                      // behavior as the legacy RIDE_REQUEST entry.
                      if (cat.key === 'RIDES') { router.push('/rides/new'); return }
                      setCategory(cat.key); setStep('content')
                    }}
                    className={`flex flex-col items-center justify-center gap-1.5 aspect-square p-3 rounded-xl border active:scale-[0.97] transition-transform ${
                      restricted
                        ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 opacity-50'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-primary-300'
                    }`}
                    aria-disabled={restricted}
                  >
                    <span className="text-2xl">{cat.icon}</span>
                    <span className="text-[11px] font-medium text-gray-800 dark:text-white text-center leading-tight">
                      {labelOf(cat)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Step 2: Content */}
        {step === 'content' && selected && (
          <div className="space-y-4" data-tour="post-content">
            {/* Selected type badge */}
            <div className="flex items-center gap-2 bg-primary-50 dark:bg-primary-900/30 rounded-xl px-3 py-2">
              <span>{selected.icon}</span>
              <span className="text-primary-700 dark:text-primary-300 font-medium text-sm">{labelOf(selected)}</span>
            </div>

            {/* SUPER_ADMIN — target neighborhood picker. */}
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

            <input
              type="text"
              placeholder={lang === 'en' ? 'Title' : lang === 'ur' ? 'عنوان' : 'العنوان'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field font-semibold"
              autoFocus
              maxLength={100}
            />
            <textarea
              placeholder={placeholderOf(selected)}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="input-field resize-none"
              rows={5}
              maxLength={1000}
            />

            {/* Contextual hint */}
            {!body && (
              <p className="text-xs text-gray-400 -mt-2 px-1">
                {category === 'NEIGHBORHOOD_REPORTS'
                  ? '💡 حدد الموقع أو الشارع لمساعدة الجيران بالتعرف على المشكلة'
                  : category === 'SERVICES'
                  ? '💡 اذكر المنطقة والميزانية لردود أسرع'
                  : category === 'LOST_FOUND'
                  ? '💡 اذكر المكان والوقت اللي شفت فيه الشيء'
                  : ['MARKETPLACE', 'HOME_BUSINESSES', 'REAL_ESTATE'].includes(category)
                  ? '💡 اذكر السعر والحالة لجذب المشترين'
                  : null}
              </p>
            )}

            {/* Price field */}
            {showPrice && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {lang === 'en' ? 'Price' : lang === 'ur' ? 'قیمت' : 'السعر'}
                  {category === 'HOME_BUSINESSES' ? (lang === 'en' ? ' (per order)' : ' (للطلب الواحد)') : ''}
                </label>
                <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-primary-500">
                  <span className="px-3 text-gray-500 dark:text-gray-400 text-sm border-l border-gray-200 dark:border-gray-700 py-3"><RiyalIcon /></span>
                  <input
                    type="number"
                    placeholder="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="flex-1 min-w-0 px-3 py-3 bg-transparent focus:outline-none text-start text-gray-900 dark:text-white"
                    dir="ltr"
                  />
                </div>
              </div>
            )}

            {/* Image picker */}
            <div data-tour="post-images">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">📷 {lang === 'en' ? 'Add photos' : lang === 'ur' ? 'تصاویر شامل کریں' : 'إضافة صور'}</label>
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
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageSelect} className="hidden" />
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
            {category === 'NEIGHBORHOOD_REPORTS' && (
              <div className="bg-orange-50 dark:bg-orange-900/30 rounded-xl p-3">
                <p className="text-orange-700 dark:text-orange-300 text-xs">
                  ⚠️ سيتم إشعار مشرف الحي بالمشكلة — كن دقيقاً في الوصف والموقع
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Leave-page sheet */}
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

      <ImageSourceSheet
        open={showImageSheet}
        onClose={() => setShowImageSheet(false)}
        onCamera={pickFromCamera}
        onGallery={pickFromGallery}
      />
    </main>
  )
}

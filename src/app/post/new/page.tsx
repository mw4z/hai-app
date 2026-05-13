'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiArrowRight, FiArrowLeft, FiSend } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import type { TranslationKey } from '@/lib/i18n'
import { useNetworkStatus } from '@/lib/network'
import { translateApiError } from '@/lib/apiError'
import RiyalIcon from '@/components/RiyalIcon'
import { uploadFiles, uploadPdf } from '@/lib/upload'
import { pickImagesOrFallback, pickImageFromCamera } from '@/lib/imagePicker'
import ImageSourceSheet from '@/components/ImageSourceSheet'
import PdfTile from '@/components/PdfTile'
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
// 10 user-facing buckets organized into 3 themed groups. Each tile
// carries a `group:` so the picker renders them under labeled
// sections instead of one flat block — same pattern Apple's App
// Store uses for "What to post" type taxonomies.
//
//   commerce      → money / business activity  (4 tiles)
//   neighborhood  → local daily life / sharing (4 tiles)
//   community     → events + contests          (2 tiles)
//
// Within a group, order is UX-driven (real frequency of use), NOT
// alphabetical and NOT enum order. RIDES routes to /rides/new
// (dedicated structured form); the rest land in this composer's
// content step. GENERAL is the "معلومة لأهل الحي" neutral-info
// bucket — composer-only, never a top-level feed chip.
type CategoryGroup = 'commerce' | 'neighborhood' | 'community'

interface CategoryGroupDef {
  key: CategoryGroup
  label: string
  labelEn: string
  labelUr: string
}

const GROUPS: CategoryGroupDef[] = [
  { key: 'commerce',     label: 'تسوق وخدمات',     labelEn: 'Shop & services',       labelUr: 'خریداری اور خدمات' },
  { key: 'neighborhood', label: 'شؤون الجيران',    labelEn: 'Neighbor matters',      labelUr: 'پڑوسیوں کے معاملات' },
  { key: 'community',    label: 'فعاليات ومسابقات', labelEn: 'Events & competitions', labelUr: 'تقریبات اور مقابلے' },
]

interface CategoryItem {
  key: string
  label: string
  labelEn: string
  labelUr: string
  icon: string
  placeholder: string
  placeholderEn: string
  placeholderUr: string
  /** One-line "what is this for?" description. Renders below the
   *  title in the picker — main aid for first-time / elderly users. */
  desc: string
  descEn: string
  /** A concrete "مثال" line shown in lighter text. */
  example: string
  exampleEn: string
  /** Search keywords (Arabic + English) — feeds the picker filter so
   *  typing "سباك" surfaces SERVICES, "للبيع" surfaces MARKETPLACE,
   *  etc. The category name and example are also matched. */
  keywords: string[]
  /** Visually elevate the card (urgent / safety). NEIGHBORHOOD_REPORTS
   *  + LOST_FOUND get a subtle ring + warmer surface. */
  important?: boolean
  /** Which section header this tile renders under. */
  group: CategoryGroup
}
const CATEGORIES: CategoryItem[] = [
  // ── Group 1: تجارة وأعمال (commerce & work) ──────────────────────
  {
    key: 'MARKETPLACE',
    label: 'السوق',
    labelEn: 'Marketplace',
    labelUr: 'مارکیٹ',
    icon: '🛒',
    desc: 'بيع أو شراء أو فرص عمل',
    descEn: 'Sell, buy, or post a job',
    example: 'مثال: جوال للبيع، أبحث عن أثاث، فرصة عمل',
    exampleEn: 'e.g., phone for sale, looking for furniture, job',
    keywords: ['بيع', 'شراء', 'سوق', 'مستعمل', 'جوال', 'أثاث', 'وظيفة', 'فرصة عمل', 'sell', 'buy', 'job', 'used'],
    placeholder: 'مثال: للبيع جهاز تكييف مستعمل بحالة ممتازة',
    placeholderEn: 'Example: Used AC for sale — excellent condition',
    placeholderUr: 'مثال: استعمال شدہ اے سی برائے فروخت — بہترین حالت',
    group: 'commerce',
  },
  {
    key: 'SERVICES',
    label: 'خدمات',
    labelEn: 'Services',
    labelUr: 'خدمات',
    icon: '🔧',
    desc: 'اعرض خدماتك أو اطلب خدمة',
    descEn: 'Offer or request a service',
    example: 'مثال: سباك، كهربائي، تنظيف',
    exampleEn: 'e.g., plumber, electrician, cleaning',
    keywords: ['خدمة', 'سباك', 'كهربائي', 'نجار', 'تنظيف', 'صيانة', 'فني', 'service', 'plumber', 'electrician', 'cleaning'],
    placeholder: 'مثال: فني تكييف — خبرة 10 سنوات — يخدم الحي',
    placeholderEn: 'Example: AC technician — 10y experience — serves the area',
    placeholderUr: 'مثال: اے سی ٹیکنیشن — 10 سال تجربہ — محلے میں خدمت',
    group: 'commerce',
  },
  {
    key: 'HOME_BUSINESSES',
    label: 'الأسر المنتجة',
    labelEn: 'Home Businesses',
    labelUr: 'گھریلو کاروبار',
    icon: '🍱',
    desc: 'أكل بيتي، حلويات، قهوة',
    descEn: 'Home food, sweets, coffee',
    example: 'مثال: كبسة، كيك، حلويات',
    exampleEn: 'e.g., kabsa, cakes, sweets',
    keywords: ['أكل', 'طبخ', 'حلويات', 'كيك', 'قهوة', 'كبسة', 'بيتي', 'food', 'cake', 'coffee', 'sweets'],
    placeholder: 'مثال: متوفر اليوم كبسة دجاج وسمبوسة — الطلب على الخاص',
    placeholderEn: 'Example: Today: chicken kabsa and samosa — order via DM',
    placeholderUr: 'مثال: آج چکن کبسہ اور سموسے دستیاب — آرڈر ڈی ایم پر',
    group: 'commerce',
  },
  {
    key: 'REAL_ESTATE',
    label: 'عقارات',
    labelEn: 'Real Estate',
    labelUr: 'جائیداد',
    icon: '🏠',
    desc: 'شقق، فلل، أراضي',
    descEn: 'Apartments, villas, land',
    example: 'مثال: شقة للإيجار، أرض للبيع',
    exampleEn: 'e.g., apartment for rent, land for sale',
    keywords: ['شقة', 'فيلا', 'إيجار', 'تمليك', 'أرض', 'عقار', 'apartment', 'rent', 'villa', 'land'],
    placeholder: 'مثال: شقة للإيجار — 3 غرف — التواصل على الخاص',
    placeholderEn: 'Example: Apartment for rent — 3 bedrooms — DM to contact',
    placeholderUr: 'مثال: کرائے کیلئے فلیٹ — 3 کمرے — رابطہ ڈی ایم پر',
    group: 'commerce',
  },
  // ── Group 2: حياة الحي (neighborhood life) ───────────────────────
  // NEIGHBORHOOD_REPORTS first inside the group so urgent reports
  // sit near the top of the section's visual rhythm. Rides next
  // (daily, common). Then lost/found and neutral info.
  {
    key: 'NEIGHBORHOOD_REPORTS',
    label: 'بلاغات الحي',
    labelEn: 'Neighborhood Reports',
    labelUr: 'محلے کی رپورٹس',
    icon: '⚠️',
    desc: 'سلامة وأمن وأعطال الحي',
    descEn: 'Safety, security, outages',
    example: 'مثال: انقطاع كهرباء، حادث، تحذير',
    exampleEn: 'e.g., power outage, accident, warning',
    keywords: ['بلاغ', 'تحذير', 'انقطاع', 'حريق', 'سرقة', 'حادث', 'مشبوه', 'report', 'warning', 'fire', 'theft'],
    important: true,
    placeholder: 'مثال: انقطاع المياه في الشارع الرئيسي',
    placeholderEn: 'Example: Water outage on main street',
    placeholderUr: 'مثال: مین سٹریٹ پر پانی کی بندش',
    group: 'neighborhood',
  },
  {
    key: 'RIDES',
    label: 'مشاوير وتوصيل',
    labelEn: 'Rides & Delivery',
    labelUr: 'سواری اور ڈیلیوری',
    icon: '🚗',
    desc: 'اطلب توصيلة أو طلب من المتجر',
    descEn: 'Request a ride or a store delivery',
    example: 'مثال: محتاج توصيلة للعمل، أو طلب من البقالة',
    exampleEn: 'e.g., ride to work, or grocery delivery',
    keywords: ['مشوار', 'توصيل', 'توصيلة', 'سائق', 'طلب', 'بقالة', 'ride', 'lift', 'delivery'],
    placeholder: '',
    placeholderEn: '',
    placeholderUr: '',
    group: 'neighborhood',
  },
  {
    key: 'LOST_FOUND',
    label: 'مفقودات',
    labelEn: 'Lost & Found',
    labelUr: 'گمشدہ اشیاء',
    icon: '🔍',
    desc: 'فقدت أو وجدت شيئاً',
    descEn: 'Lost or found something',
    example: 'مثال: محفظة، مفاتيح، قطة',
    exampleEn: 'e.g., wallet, keys, cat',
    keywords: ['مفقود', 'ضاع', 'لقيت', 'محفظة', 'مفاتيح', 'قطة', 'كلب', 'lost', 'found', 'wallet', 'keys'],
    important: true,
    placeholder: 'مثال: وجدت مفاتيح عند المسجد',
    placeholderEn: 'Example: Found keys near the mosque',
    placeholderUr: 'مثال: مسجد کے پاس چابیاں ملی ہیں',
    group: 'neighborhood',
  },
  // Neighborhood info — neutral, non-commercial, non-civic. Maps to
  // PostCategory.GENERAL + intent NORMAL on submit. Reserved for
  // "محل جديد فتح / صيدلية جديدة / مكان نقل موقعه" — facts about
  // the neighborhood. The classifier polices the boundary on the
  // server: if the post turns out commercial ("خصم / عندنا" →
  // MARKETPLACE) or civic ("خطر / مشكلة" → NEIGHBORHOOD_REPORTS), it
  // gets auto-routed. GENERAL is NOT a top-level chip; these posts
  // are reachable via the ALL chip only.
  {
    key: 'GENERAL',
    label: 'معلومة لأهل الحي',
    labelEn: 'Neighborhood info',
    labelUr: 'محلے کیلئے معلومات',
    icon: 'ℹ️',
    desc: 'معلومة مفيدة محايدة لجيرانك',
    descEn: 'A neutral, useful tip for neighbors',
    example: 'مثال: صيدلية جديدة فتحت، محل نقل موقعه',
    exampleEn: 'e.g., a new pharmacy opened, a shop relocated',
    keywords: ['معلومة', 'افتتاح', 'جديد', 'نقل', 'مكان', 'info', 'news', 'opened'],
    placeholder: 'مثال: فتح محل نظارات جديد بجانب التموينات',
    placeholderEn: 'Example: A new optical shop opened next to the supermarket',
    placeholderUr: 'مثال: سپر مارکیٹ کے پاس عینکوں کی نئی دکان کھل گئی',
    group: 'neighborhood',
  },
  // ── Group 3: فعاليات ومسابقات (events & competitions) ────────────
  {
    key: 'EVENTS',
    label: 'فعاليات ومناسبات',
    labelEn: 'Events',
    labelUr: 'تقریبات',
    icon: '🎉',
    desc: 'فعاليات وتجمعات الحي',
    descEn: 'Local events and gatherings',
    example: 'مثال: تجمع إفطار، دورة، مسابقة',
    exampleEn: 'e.g., iftar gathering, course, contest',
    keywords: ['فعالية', 'حفل', 'دعوة', 'تجمع', 'دورة', 'event', 'gathering', 'class'],
    placeholder: 'مثال: توزيع إفطار رمضان عند مسجد الحي الساعة 6',
    placeholderEn: 'Example: Ramadan iftar distribution at the mosque at 6pm',
    placeholderUr: 'مثال: محلے کی مسجد پر شام 6 بجے افطار کی تقسیم',
    group: 'community',
  },
  {
    key: 'COMPETITIONS',
    label: 'مسابقات وجوائز',
    labelEn: 'Competitions',
    labelUr: 'مقابلے',
    icon: '🏆',
    desc: 'مسابقات وجوائز للحي',
    descEn: 'Contests and prizes',
    example: 'مثال: مسابقة قرآن، جوائز رمضان',
    exampleEn: 'e.g., Quran contest, Ramadan prizes',
    keywords: ['مسابقة', 'جائزة', 'فائز', 'contest', 'prize', 'winner'],
    placeholder: 'مثال: مسابقة حفظ القرآن للأطفال — جوائز قيمة',
    placeholderEn: 'Example: Quran memorization contest for kids — great prizes',
    placeholderUr: 'مثال: بچوں کیلئے قرآن حفظ کا مقابلہ — قیمتی انعامات',
    group: 'community',
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
  // Deep-link target: /post/new?category=NEIGHBORHOOD_REPORTS jumps
  // straight to the content step with that tile selected. Used by the
  // feed empty-state CTAs (Report issue → NEIGHBORHOOD_REPORTS,
  // Offer help → SERVICES) so each button transfers to its dedicated
  // composer instead of dropping the user back at the category grid.
  // Validated against the known set so an invalid value silently
  // falls back to the picker. RIDES is intentionally excluded —
  // /rides/new is a separate flow.
  const initialCategoryParam = (() => {
    const v = searchParams?.get('category') || ''
    const valid = new Set([
      'MARKETPLACE', 'SERVICES', 'HOME_BUSINESSES', 'REAL_ESTATE',
      'NEIGHBORHOOD_REPORTS', 'LOST_FOUND', 'GENERAL',
      'EVENTS', 'COMPETITIONS',
    ])
    return valid.has(v) ? v : ''
  })()
  const { lang, t } = useLanguage()
  const [step, setStep] = useState<'category' | 'content'>(initialCategoryParam ? 'content' : 'category')
  const [category, setCategory] = useState(initialCategoryParam)
  // Marketplace listing subtype — only meaningful when category=MARKETPLACE.
  // Default SELL matches the schema default and keeps existing flows.
  const [marketplaceType, setMarketplaceType] = useState<'SELL' | 'BUY' | 'JOB'>('SELL')
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
  // Separate "uploading PDF" flag so the publish button can label
  // its in-progress state correctly. The legacy `uploading` flag
  // covers both branches for the disabled-state, but the button
  // copy needs to distinguish "رفع الصور…" (images) from
  // "رفع الملف…" (single PDF) — using one flag would mislabel
  // mid-flight when only a PDF is attached.
  const [uploadingPdf, setUploadingPdf] = useState(false)
  // PDF attachment — single document up to 25MB. While selected but
  // not yet uploaded, `localFile` holds the raw File for upload on
  // submit; once uploaded, `url` is set. The composer shows a tile
  // preview either way.
  const [pdf, setPdf] = useState<{
    localFile: File | null
    url: string | null
    name: string
    size: number
  } | null>(null)
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
    // NOTE: SERVICES is NOT restricted at the tile level. The tile
    // description says "اعرض خدماتك أو اطلب خدمة" — both halves must
    // be reachable. Non-providers are routed to /ask in the click
    // handler (creates SERVICES + intent=REQUEST). Providers go to
    // the normal composer where intent=OFFER is allowed.
    // (The server-side check in /api/posts is the canonical guard
    // for OFFER-side abuse, not the tile.)
    if (ADMIN_ONLY_CATEGORIES.has(key) && !isAdminLike) return true
    return false
  }

  // Whether this user can post an OFFER under SERVICES. Used by the
  // SERVICES tile click handler to decide between composer and Ask.
  const canPostServiceOffer = canPostServices || isAdminLike

  const selected = CATEGORIES.find(i => i.key === category)
  const showPrice = PRICE_CATEGORIES.has(category)

  const imageInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  function handlePdfSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.type !== 'application/pdf') {
      toast.error(lang === 'en' ? 'Only PDF files' : lang === 'ur' ? 'صرف PDF فائلیں' : 'فقط ملفات PDF')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error(lang === 'en' ? 'PDF too large (max 25MB)' : lang === 'ur' ? 'PDF بہت بڑی ہے (زیادہ سے زیادہ 25MB)' : 'حجم الملف كبير (أقصى 25 ميقا)')
      return
    }
    setPdf({ localFile: file, url: null, name: file.name, size: file.size })
  }
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

      // Upload the PDF (if any) via the client-direct path before
      // building the request body. uploadPdf goes browser → Vercel
      // Blob, so the Next.js function never sees 25MB of file bytes.
      // A failure here aborts submit and surfaces the error to the
      // user — the post is not created without its attachment.
      let pdfUrl: string | null = pdf?.url ?? null
      let pdfName: string | null = pdf?.name ?? null
      if (pdf && pdf.localFile && !pdf.url) {
        // Set BOTH flags: `uploading` keeps the button disabled
        // (unchanged behavior), `uploadingPdf` lets the label render
        // "رفع الملف…" instead of "رفع الصور…".
        setUploading(true)
        setUploadingPdf(true)
        try {
          const result = await uploadPdf(pdf.localFile)
          pdfUrl = result.url
          pdfName = result.name
          // Cache on the local state too in case of retry after
          // category_mismatch — we don't want to re-upload the PDF
          // when the user accepts the suggested category.
          setPdf({ localFile: null, url: result.url, name: result.name, size: result.size })
        } catch (err: any) {
          toast.error(
            err?.message ||
              (lang === 'en' ? 'PDF upload failed' : lang === 'ur' ? 'PDF اپ لوڈ ناکام' : 'فشل رفع الملف'),
          )
          setLoading(false)
          setUploading(false)
          setUploadingPdf(false)
          return
        } finally {
          setUploading(false)
          setUploadingPdf(false)
        }
      }

      // Submit with overridable category/marketplaceType so we can
      // resubmit with the classifier's suggestion if the user accepts.
      const submit = async (
        useCategory: string,
        useMarketplaceType: 'SELL' | 'BUY' | 'JOB',
      ) => fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          category: useCategory,
          // "معلومة لأهل الحي" picker maps to GENERAL+NORMAL explicitly.
          // The classifier still auto-routes the post if the text turns
          // out to be commercial/civic — it just won't drift to REQUEST
          // on a casual "فيه..." mention when the user is sharing info.
          ...(useCategory === 'GENERAL' ? { intent: 'NORMAL' } : {}),
          price: price ? parseFloat(price) : null,
          imageUrls,
          pdfUrl,
          pdfName,
          locationLat: location?.lat || null,
          locationLng: location?.lng || null,
          locationName: location?.name || null,
          ...(useCategory === 'MARKETPLACE' ? { marketplaceType: useMarketplaceType } : {}),
          ...(isSuperAdmin && targetNeighborhoodId && targetNeighborhoodId !== ownNeighborhoodId
            ? { neighborhoodId: targetNeighborhoodId }
            : {}),
        }),
      })

      let res = await submit(category, marketplaceType)
      let data = await res.json()

      // category_mismatch — the classifier flagged it. Ask the user
      // to accept the suggestion; if they confirm, resubmit.
      if (!res.ok && data?.error === 'category_mismatch' && data?.suggestedCategory) {
        const suggested = String(data.suggestedCategory)
        const suggestedMt = (data.suggestedMarketplaceType as 'SELL' | 'BUY' | 'JOB' | undefined) ?? 'SELL'
        const labelKey = `post_v2_${suggested}` as TranslationKey
        const suggestedLabel = (() => { try { return t(labelKey) } catch { return suggested } })()
        const proceed = window.confirm(
          lang === 'en'
            ? `This post seems to fit "${suggestedLabel}" better. Continue with that category?`
            : `يبدو أن المنشور أنسب لقسم "${suggestedLabel}". هل تريد المتابعة بهذا القسم؟`,
        )
        if (proceed) {
          setCategory(suggested)
          if (suggested === 'MARKETPLACE') setMarketplaceType(suggestedMt)
          res = await submit(suggested, suggestedMt)
          data = await res.json()
        } else {
          // User declined — let them edit the post.
          setLoading(false)
          return
        }
      }

      if (!res.ok) {
        playError()
        toast.error(translateApiError(data, lang as 'ar' | 'en' | 'ur'), {
          duration: 4500,
        })
        return
      }

      playSuccess()

      // Auto-correct toast — the server silently moved the post.
      if (data?.autoCorrected?.category) {
        const movedKey = `post_v2_${data.autoCorrected.category}` as TranslationKey
        const movedLabel = (() => { try { return t(movedKey) } catch { return String(data.autoCorrected.category) } })()
        toast.success(
          lang === 'en'
            ? `Moved to the better-fit section: ${movedLabel}`
            : `نقلنا المنشور إلى القسم الأنسب: ${movedLabel}`,
          { duration: 3500 },
        )
      } else {
        toast.success(lang === 'en' ? 'Posted!' : 'تم نشر منشورك!')
      }

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
                ? (uploadingPdf
                    // Single PDF upload — "uploading the file"
                    ? (lang === 'en' ? 'Uploading PDF…' : lang === 'ur' ? 'PDF اپ لوڈ…' : 'رفع الملف…')
                    // Image batch upload — keep the original copy
                    : (lang === 'en' ? 'Uploading photos…' : lang === 'ur' ? 'تصاویر اپ لوڈ…' : 'رفع الصور…'))
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

        {/* Step 1: Category — elderly-friendly rich tiles. 2-column
            grid with title + 1-line description + example, larger
            touch targets. Visual hierarchy: NEIGHBORHOOD_REPORTS +
            LOST_FOUND get an amber ring + warmer surface
            (cat.important). */}
        {step === 'category' && (
          <div className="space-y-4 pb-24" data-tour="post-categories" style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}>
            {/* Top guidance — primary instruction + helper. Larger
                font for older users; lang switches Arabic/English. */}
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                {lang === 'en' ? 'What do you want to post?' : lang === 'ur' ? 'آپ کیا پوسٹ کرنا چاہتے ہیں؟' : 'وش حاب تنشر اليوم؟'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {lang === 'en' ? 'Tap the section that fits to start posting.' : lang === 'ur' ? 'پوسٹ شروع کرنے کیلئے مناسب سیکشن دبائیں۔' : 'اضغط على القسم المناسب لبدء النشر'}
              </p>
            </div>

            {/* Grouped tiles — three labeled sections (Commerce,
                Neighborhood Life, Events & Competitions) instead of
                one flat 10-tile block. Group headers are small
                uppercase tracking labels in iOS App Store style:
                visually subtle, not loud, so the tiles themselves
                stay the visual anchor. Each section renders its
                own 2/3-column grid. */}
            <div className="space-y-5">
              {GROUPS.map((group) => {
                const items = visibleCategories.filter((c) => c.group === group.key)
                if (items.length === 0) return null
                const groupLabel = lang === 'en' ? group.labelEn : lang === 'ur' ? group.labelUr : group.label
                return (
                  <section key={group.key} className="space-y-2.5">
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500 px-1">
                      {groupLabel}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {items.map((cat) => {
                        const restricted = isCategoryRestricted(cat.key)
                        return (
                          <button
                            key={cat.key}
                            onClick={() => {
                              if (restricted) {
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
                              if (cat.key === 'RIDES') { router.push('/rides/new'); return }
                              // SERVICES tile = "offer or request".
                              // Non-providers can only request — route them
                              // to /ask which creates SERVICES + intent=REQUEST.
                              // Providers go to the normal composer where
                              // intent=OFFER is allowed.
                              if (cat.key === 'SERVICES' && !canPostServiceOffer) {
                                router.push('/ask?category=SERVICES')
                                return
                              }
                              setCategory(cat.key); setStep('content')
                            }}
                            // min-h-[136px] keeps every tile a comfortable
                            // touch target (>>44px), even when description
                            // wraps. text-start so Arabic + English read
                            // naturally per dir.
                            className={`relative flex flex-col gap-1 text-start p-3.5 rounded-2xl border-2 min-h-[136px] active:scale-[0.97] transition-transform shadow-sm focus:outline-none focus-visible:outline-none ${
                              restricted
                                ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 opacity-50'
                                : cat.important
                                  ? 'border-amber-300 dark:border-amber-500/60 bg-amber-50 dark:bg-amber-900/20'
                                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                            }`}
                            aria-disabled={restricted}
                            aria-label={labelOf(cat)}
                          >
                            <span className="text-3xl leading-none mb-1" aria-hidden>{cat.icon}</span>
                            <span className="text-[15px] font-bold text-gray-900 dark:text-white leading-tight">
                              {labelOf(cat)}
                            </span>
                            <span className="text-[12px] text-gray-700 dark:text-gray-300 leading-tight">
                              {lang === 'en' ? cat.descEn : cat.desc}
                            </span>
                            <span className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight mt-auto pt-1">
                              {lang === 'en' ? cat.exampleEn : cat.example}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
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

            {/* Marketplace subtype selector — only when posting in
                MARKETPLACE. SELL is preselected (matches schema default
                and existing flow). JOB triggers extra anti-spam rules
                server-side. */}
            {category === 'MARKETPLACE' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 px-1">
                  {lang === 'en' ? 'Listing type' : lang === 'ur' ? 'لسٹنگ کی قسم' : 'نوع الإعلان'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'SELL', icon: '🛒', ar: 'بيع',       en: 'Sell' },
                    { key: 'BUY',  icon: '📥', ar: 'شراء',      en: 'Buy' },
                    { key: 'JOB',  icon: '💼', ar: 'فرصة عمل', en: 'Job' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setMarketplaceType(opt.key)}
                      className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors ${
                        marketplaceType === opt.key
                          ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <span>{opt.icon}</span>
                      <span>{lang === 'en' ? opt.en : opt.ar}</span>
                    </button>
                  ))}
                </div>
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

            {/* PDF attachment — single optional document, max 25MB.
                Real-world fit: real-estate floor plans, service price
                lists, event flyers, restaurant menus. Tile uses the
                shared PdfTile component in 'preview' variant; tap on
                the tile body opens nothing in the composer (the ✕
                next to it removes the attachment). On submit, if a
                localFile is present we call uploadPdf() and add the
                returned URL + name to the body. */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-2">
                📄 {lang === 'en' ? 'Attach PDF (optional)' : lang === 'ur' ? 'PDF منسلک کریں (اختیاری)' : 'إرفاق ملف PDF (اختياري)'}
              </label>
              {pdf ? (
                <div className="flex items-stretch gap-2">
                  <div className="flex-1 min-w-0">
                    <PdfTile url={pdf.url || '#'} name={pdf.name} size={pdf.size} variant="preview" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPdf(null)}
                    aria-label={lang === 'en' ? 'Remove PDF' : 'إزالة الملف'}
                    className="flex-shrink-0 w-10 self-stretch rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 active:scale-95 transition-transform flex items-center justify-center"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => pdfInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl py-3 text-sm text-gray-400 cursor-pointer hover:border-rose-300 hover:text-rose-500 transition-colors"
                  >
                    <span>+ {lang === 'en' ? 'Choose PDF' : lang === 'ur' ? 'PDF منتخب کریں' : 'اختر ملف PDF'}</span>
                  </button>
                  <input ref={pdfInputRef} type="file" accept="application/pdf" onChange={handlePdfSelect} className="hidden" />
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

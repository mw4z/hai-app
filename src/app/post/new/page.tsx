'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { FiArrowRight, FiArrowLeft } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { translateApiError } from '@/lib/apiError'
import BackButton from '@/components/BackButton'
import RiyalIcon from '@/components/RiyalIcon'
import { uploadFiles } from '@/lib/upload'
import { pickImagesOrFallback } from '@/lib/imagePicker'
import { playSuccess, playError } from '@/lib/sound'

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
  const { lang } = useLanguage()
  const [step, setStep] = useState<'category' | 'content'>('category')
  const [category, setCategory] = useState('')
  const [isFemale, setIsFemale] = useState(false)
  // Only visible providers (ACTIVE/VERIFIED) may post in the SERVICES category.
  const [canPostServices, setCanPostServices] = useState(false)

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(d => {
      if (d.gender === 'FEMALE') setIsFemale(true)
      if (d.providerStatus === 'ACTIVE' || d.providerStatus === 'VERIFIED') {
        setCanPostServices(true)
      }
    }).catch(() => {})
  }, [])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [price, setPrice] = useState('')
  const [images, setImages] = useState<{ file: File; preview: string; url?: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [location, setLocation] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [detectingLocation, setDetectingLocation] = useState(false)

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
      toast.error('أدخل العنوان والتفاصيل')
      return
    }
    if (!category) {
      toast.error(lang === 'en' ? 'Select a category' : 'اختر نوع المنشور')
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
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        playError()
        toast.error(translateApiError(data, lang as 'ar' | 'en' | 'ur'))
        return
      }

      playSuccess()
      toast.success('تم نشر منشورك!')
      sessionStorage.setItem('hai_feed_refresh', '1')
      router.push('/feed')
    } catch {
      toast.error('تعذر الاتصال')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-white dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 dark:border-gray-700">
        {step === 'content' ? (
          <button onClick={() => setStep('category')} className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 py-1">
            {lang !== 'en' ? <FiArrowRight className="w-5 h-5" /> : <FiArrowLeft className="w-5 h-5" />}
            <span className="text-sm font-medium">{lang === 'en' ? 'Back' : lang === 'ur' ? 'واپس' : 'رجوع'}</span>
          </button>
        ) : (
          <BackButton href="/feed" label={lang === 'en' ? 'Cancel' : lang === 'ur' ? 'منسوخ' : 'إلغاء'} />
        )}
        <h1 className="flex-1 text-center font-bold text-gray-900 dark:text-white">منشور جديد</h1>
        {step === 'content' && (
          <button
            onClick={handleSubmit}
            disabled={loading || uploading}
            className="text-primary-600 font-semibold text-sm disabled:opacity-50"
          >
            {uploading ? 'رفع الصور...' : loading ? 'جاري النشر...' : 'نشر'}
          </button>
        )}
      </div>

      <div className="flex-1 px-4 py-4 overflow-y-auto overscroll-contain">

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
                        navigator.geolocation.getCurrentPosition(
                          async (pos) => {
                            const { latitude: lat, longitude: lng } = pos.coords
                            let name = `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                            try {
                              const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=${lang}&addressdetails=1`)
                              const data = await res.json()
                              name = data.address?.suburb || data.address?.neighbourhood || data.address?.road || data.display_name?.split(',')[0] || name
                            } catch { /* */ }
                            setLocation({ lat, lng, name })
                            setDetectingLocation(false)
                          },
                          () => { toast.error(lang === 'en' ? 'Allow location access' : lang === 'ur' ? 'براہ کرم مقام کی اجازت دیں' : 'يرجى السماح بالوصول للموقع'); setDetectingLocation(false) },
                          { enableHighAccuracy: true, timeout: 10000 }
                        )
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
    </main>
  )
}

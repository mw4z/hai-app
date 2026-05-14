'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiX } from 'react-icons/fi'
import type { PlaceCategory } from '@prisma/client'
import { useLanguage } from '@/hooks/useLanguage'
import { PLACE_CATEGORIES } from '@/lib/places/categories'
import DirectoryHeader from '@/components/places/DirectoryHeader'
import OpeningHoursPicker from '@/components/places/OpeningHoursPicker'
import { uploadFiles } from '@/lib/upload'

const MAX_IMAGES = 5

/** Submit form for /directory/new. MVP — no image upload (Phase 1.5).
 *  Owner-editable subset post-claim mirrors this same field list
 *  minus name/category/lat/lng. */
export default function NewPlaceClient() {
  const router = useRouter()
  const { lang } = useLanguage()

  const [name, setName] = useState('')
  const [category, setCategory] = useState<PlaceCategory>('SHOP_SERVICES')
  const [addressText, setAddressText] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [mapUrl, setMapUrl] = useState('')
  const [description, setDescription] = useState('')
  const [openingHours, setOpeningHours] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Image picker state — uploaded on submit, same pattern as the
  // post composer. We hold the raw File + a blob preview URL so
  // the picker shows thumbnails before they leave the device.
  const [images, setImages] = useState<{ file: File; preview: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  function pickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    const remaining = MAX_IMAGES - images.length
    for (const file of files.slice(0, remaining)) {
      if (file.size > 10 * 1024 * 1024) { toast.error(tr('Image too large', 'حجم الصورة كبير', 'تصویر بہت بڑی')); continue }
      if (!file.type.startsWith('image/')) { toast.error(tr('Image only', 'صور فقط', 'صرف تصاویر')); continue }
      const preview = URL.createObjectURL(file)
      setImages((prev) => [...prev, { file, preview }])
    }
  }
  function removeImage(i: number) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[i].preview)
      return prev.filter((_, j) => j !== i)
    })
  }

  async function submit() {
    if (submitting) return
    if (!name.trim()) {
      toast.error(tr('Name required', 'الاسم مطلوب', 'نام درکار ہے'))
      return
    }
    setSubmitting(true)
    try {
      // Upload images first if any were picked. Existing
      // /api/upload validates MIME + size + multipart shape before
      // returning the array of public URLs. Failure here aborts
      // submit so we don't post a row with broken/missing media.
      let imageUrls: string[] = []
      if (images.length > 0) {
        try {
          imageUrls = await uploadFiles(images.map((i) => i.file))
        } catch (err: any) {
          toast.error(err?.message || tr('Image upload failed', 'فشل رفع الصور', 'تصاویر اپ لوڈ ناکام'))
          setSubmitting(false)
          return
        }
      }
      const res = await fetch('/api/directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, category,
          addressText: addressText || undefined,
          phone: phone || undefined,
          whatsapp: whatsapp || undefined,
          mapUrl: mapUrl || undefined,
          description: description || undefined,
          openingHours: openingHours || undefined,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(tr('Submitted for review', 'تم الإرسال للمراجعة', 'جائزے کیلئے بھیج دیا گیا'))
        router.push(`/directory/${d.place.id}`)
        return
      }
      if (res.status === 409 && d?.error === 'duplicate_place') {
        toast.error(tr('A similar place already exists.', 'يوجد مكان مماثل بالفعل.', 'اسی طرح کی جگہ پہلے سے موجود ہے۔'))
        if (d.existing?.id) router.push(`/directory/${d.existing.id}`)
        return
      }
      if (res.status === 429) {
        toast.error(tr('Weekly limit reached.', 'وصلت الحد الأقصى الأسبوعي.', 'ہفتہ وار حد پوری ہو گئی۔'))
        return
      }
      toast.error(d?.error || tr('Failed', 'فشل', 'ناکام'))
    } catch {
      toast.error(tr('Connection failed', 'فشل الاتصال', 'کنیکشن ناکام'))
    } finally { setSubmitting(false) }
  }

  return (
    <main className="hai-directory-screen min-h-screen bg-gray-50 dark:bg-gray-900">
      <DirectoryHeader
        title={tr('Add a place', 'إضافة مكان', 'جگہ شامل کریں')}
        backHref="/directory"
      />
      <div className="max-w-[640px] mx-auto px-4 py-4 space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {tr(
            'Your submission will be reviewed by a moderator before appearing in the directory.',
            'سيتم مراجعة طلبك من المشرف قبل ظهوره في الدليل.',
            'آپ کی درخواست کا جائزہ موڈریٹر لے گا۔',
          )}
        </p>

        <Field label={tr('Name', 'الاسم', 'نام')}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="input-field"
            autoFocus
          />
        </Field>

        <Field label={tr('Category', 'التصنيف', 'زمرہ')}>
          <select value={category} onChange={(e) => setCategory(e.target.value as PlaceCategory)} className="input-field">
            {PLACE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.emoji} {lang === 'en' ? c.labelEn : lang === 'ur' ? c.labelUr : c.labelAr}
              </option>
            ))}
          </select>
        </Field>

        <Field label={tr('Address (optional)', 'العنوان (اختياري)', 'پتہ (اختیاری)')}>
          <input value={addressText} onChange={(e) => setAddressText(e.target.value)} maxLength={200} className="input-field" />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label={tr('Phone', 'الجوال', 'فون')}>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" placeholder="05xxxxxxxx" className="input-field" />
          </Field>
          <Field label={tr('WhatsApp', 'واتساب', 'واٹس ایپ')}>
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} dir="ltr" placeholder="05xxxxxxxx" className="input-field" />
          </Field>
        </div>

        <Field label={tr('Map URL (optional)', 'رابط الخريطة (اختياري)', 'نقشہ لنک (اختیاری)')}>
          <input value={mapUrl} onChange={(e) => setMapUrl(e.target.value)} dir="ltr" placeholder="https://maps.google.com/..." className="input-field" />
        </Field>

        <Field label={tr('Description (optional)', 'الوصف (اختياري)', 'تفصیل (اختیاری)')}>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} className="input-field resize-none" />
        </Field>

        <div>
          <span className="block text-[12px] font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            🕒 {tr('Opening hours (optional)', 'ساعات العمل (اختياري)', 'اوقات کار (اختیاری)')}
          </span>
          <OpeningHoursPicker value={openingHours} onChange={setOpeningHours} />
        </div>

        {/* Image picker — up to 5 photos. Uploaded on submit. */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-medium text-gray-600 dark:text-gray-400">
              📷 {tr('Photos (optional)', 'الصور (اختياري)', 'تصاویر (اختیاری)')}
            </span>
            <span className="text-[11px] text-gray-400">{images.length}/{MAX_IMAGES}</span>
          </div>
          {images.length > 0 && (
            <div className="flex gap-2 mb-2 overflow-x-auto">
              {images.map((img, i) => (
                <div key={i} className="relative flex-shrink-0">
                  <img src={img.preview} alt="" className="w-20 h-20 object-cover rounded-xl border border-gray-200 dark:border-gray-700" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    aria-label={tr('Remove photo', 'إزالة الصورة', 'تصویر ہٹائیں')}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    <FiX className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {images.length < MAX_IMAGES && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl py-3 text-sm text-gray-400 cursor-pointer hover:border-primary-300 hover:text-primary-500 transition-colors"
              >
                + {tr('Choose photos', 'اختر صور', 'تصاویر منتخب کریں')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={pickImages}
                className="hidden"
              />
            </>
          )}
        </div>

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full py-3 mt-2 rounded-2xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform"
        >
          {submitting
            ? tr('Submitting…', 'جاري الإرسال…', 'بھیج رہا ہے…')
            : tr('Submit for review', 'إرسال للمراجعة', 'جائزے کیلئے بھیجیں')}
        </button>
      </div>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</span>
      {children}
    </label>
  )
}

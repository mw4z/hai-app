'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiX, FiMapPin, FiCheck } from 'react-icons/fi'
import type { PlaceCategory } from '@prisma/client'
import { useLanguage } from '@/hooks/useLanguage'
import { PLACE_CATEGORIES } from '@/lib/places/categories'
import DirectoryHeader from '@/components/places/DirectoryHeader'
import OpeningHoursPicker from '@/components/places/OpeningHoursPicker'
import PlaceAutocomplete, { type SelectedPlace } from '@/components/places/PlaceAutocomplete'
import { openMapPicker } from '@/components/rides/openMapPicker'
import { uploadFiles } from '@/lib/upload'

// Riyadh fallback center for the map picker when no coords are set yet.
const FALLBACK_CENTER = { lat: 24.7136, lng: 46.6753 }

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
  const [website, setWebsite] = useState('')
  // Coordinates — captured from Places autocomplete or the map pin.
  // Sent to /api/directory which validates both-or-neither (WGS84).
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  // Google place_id when this listing was started from a Places pick.
  // The server uses it to snapshot rating/hours/photos + tag source.
  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(null)
  const [instagram, setInstagram] = useState('')
  const [snapchat, setSnapchat] = useState('')
  const [tiktok, setTiktok] = useState('')
  const [twitter, setTwitter] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // 0..100 while images are uploading; null when no upload in
  // flight. Drives the per-thumbnail progress bar overlay so the
  // user can see the upload is still working (avoids the "looks
  // like it errored, then suddenly succeeds" anti-pattern on
  // slow networks).
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  // "I'm the owner" toggle — if true, we submit a claim request
  // alongside the place create so the mod reviews both at once.
  const [claimAsOwner, setClaimAsOwner] = useState(false)
  const [ownerProof, setOwnerProof] = useState('')

  // Image picker state — uploaded on submit, same pattern as the
  // post composer. We hold the raw File + a blob preview URL so
  // the picker shows thumbnails before they leave the device.
  const [images, setImages] = useState<{ file: File; preview: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  // Autofill from a Google Places selection. Only overwrites fields
  // Google actually returned — never blanks out something the user
  // already typed. Coordinates always come as a pair.
  function applyPlace(p: SelectedPlace) {
    if (p.name) setName(p.name)
    if (p.address) setAddressText(p.address)
    // Auto-detect category from Google place types.
    if (p.category) setCategory(p.category as PlaceCategory)
    if (p.phone) {
      setPhone(p.phone)
      // Most KSA shops use one number for both calls + WhatsApp.
      // Mirror it into WhatsApp when that field is still empty.
      setWhatsapp((prev) => (prev.trim() ? prev : p.phone!))
    }
    if (p.website) setWebsite(p.website)
    if (p.mapUrl) setMapUrl(p.mapUrl)
    // NOTE: we deliberately do NOT autofill the openingHours picker
    // from Google — Google's hours (shifts / per-day variation) can't
    // be represented in the single-schedule picker without losing
    // detail. The accurate Google hours are stored server-side
    // (periods + per-day text) and shown + drive the pill directly.
    if (p.latitude !== null && p.longitude !== null) {
      setLatitude(p.latitude)
      setLongitude(p.longitude)
    }
    if (p.placeId) setGooglePlaceId(p.placeId)
    toast.success(tr('Details filled in', 'تم تعبئة البيانات', 'تفصیلات بھر دی گئیں'))
  }

  // Open the existing MapLibre/MapTiler picker to set or adjust the
  // pin. Centers on the current coords (or Riyadh fallback). On
  // confirm we store lat/lng and, if the address field is empty,
  // seed it with the reverse-geocoded address.
  async function pickOnMap() {
    const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY || ''
    const center =
      latitude !== null && longitude !== null
        ? { lat: latitude, lng: longitude }
        : FALLBACK_CENTER
    const result = await openMapPicker({
      centerLat: center.lat,
      centerLng: center.lng,
      lang,
      maptilerKey,
    })
    if (result) {
      setLatitude(result.lat)
      setLongitude(result.lng)
      if (!addressText.trim() && result.address) setAddressText(result.address)
    }
  }

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
          setUploadProgress(0)
          imageUrls = await uploadFiles(
            images.map((i) => i.file),
            { onProgress: (pct) => setUploadProgress(pct) },
          )
          setUploadProgress(null)
        } catch (err: any) {
          setUploadProgress(null)
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
          latitude: latitude ?? undefined,
          longitude: longitude ?? undefined,
          googlePlaceId: googlePlaceId || undefined,
          description: description || undefined,
          openingHours: openingHours || undefined,
          website: website || undefined,
          instagram: instagram || undefined,
          snapchat: snapchat || undefined,
          tiktok: tiktok || undefined,
          x: twitter || undefined,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          // Owner-claim payload — API picks these up and creates
          // a PlaceClaimRequest alongside the place so the mod
          // can review both in one go.
          claimAsOwner: claimAsOwner || undefined,
          ownerProof: claimAsOwner && ownerProof.trim() ? ownerProof.trim() : undefined,
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

        {/* Google Places search — type the business name, pick it,
            and name/address/phone/website/coords autofill below.
            Degrades silently if Places isn't configured. */}
        <div className="rounded-2xl border border-primary-200 dark:border-primary-800/60 bg-primary-50/60 dark:bg-primary-900/15 p-3 space-y-2">
          <span className="block text-[12px] font-bold text-primary-700 dark:text-primary-300">
            ✨ {tr('Quick fill from Google Maps', 'تعبئة سريعة من خرائط Google', 'گوگل میپس سے فوری بھریں')}
          </span>
          <PlaceAutocomplete onSelect={applyPlace} />
          <p className="text-[10.5px] text-gray-500 dark:text-gray-400 leading-snug">
            {tr(
              'Optional — you can also fill everything manually below.',
              'اختياري — يمكنك أيضاً تعبئة الحقول يدويًا بالأسفل.',
              'اختیاری — آپ نیچے دستی طور پر بھی بھر سکتے ہیں۔',
            )}
          </p>
        </div>

        <Field label={tr('Name', 'الاسم', 'نام')}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="input-field"
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

        {/* Location pin — set/adjust via the map picker. Shows a
            confirmed state once coords exist (from autocomplete or
            the map). The raw Map URL stays editable underneath for
            anyone who wants to paste a link directly. */}
        <div>
          <span className="block text-[12px] font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            📍 {tr('Location (optional)', 'الموقع (اختياري)', 'مقام (اختیاری)')}
          </span>
          <button
            type="button"
            onClick={pickOnMap}
            className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
              latitude !== null && longitude !== null
                ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200'
                : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              {latitude !== null && longitude !== null ? (
                <FiCheck className="w-4 h-4 flex-shrink-0" />
              ) : (
                <FiMapPin className="w-4 h-4 flex-shrink-0" />
              )}
              <span className="truncate">
                {latitude !== null && longitude !== null
                  ? tr('Location pinned', 'تم تحديد الموقع', 'مقام مقرر')
                  : tr('Set location on map', 'حدد الموقع على الخريطة', 'نقشے پر مقام مقرر کریں')}
              </span>
            </span>
            <span className="text-[11px] flex-shrink-0" dir="ltr">
              {latitude !== null && longitude !== null
                ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                : ''}
            </span>
          </button>
        </div>

        <Field label={tr('Map URL (optional)', 'رابط الخريطة (اختياري)', 'نقشہ لنک (اختیاری)')}>
          <input value={mapUrl} onChange={(e) => setMapUrl(e.target.value)} dir="ltr" placeholder="https://maps.google.com/..." className="input-field" />
        </Field>

        <Field label={tr('Description (optional)', 'الوصف (اختياري)', 'تفصیل (اختیاری)')}>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} className="input-field resize-none" />
        </Field>

        <Field label={tr('Website (optional)', 'الموقع (اختياري)', 'ویب سائٹ (اختیاری)')}>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} dir="ltr" placeholder="https://" className="input-field" />
        </Field>

        <div>
          <span className="block text-[12px] font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            {tr('Social handles (optional)', 'حسابات التواصل (اختياري)', 'سوشل ہینڈلز (اختیاری)')}
          </span>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              dir="ltr"
              placeholder="📷 Instagram @handle"
              className="input-field"
            />
            <input
              value={snapchat}
              onChange={(e) => setSnapchat(e.target.value)}
              dir="ltr"
              placeholder="👻 Snapchat @handle"
              className="input-field"
            />
            <input
              value={tiktok}
              onChange={(e) => setTiktok(e.target.value)}
              dir="ltr"
              placeholder="🎵 TikTok @handle"
              className="input-field"
            />
            <input
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              dir="ltr"
              placeholder="✕ X / Twitter @handle"
              className="input-field"
            />
          </div>
        </div>

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
                  {/* Upload-progress overlay. Renders only while
                      uploadProgress is a number (i.e. an upload
                      is in flight). All thumbnails share the same
                      overall % — the network request is a single
                      multipart POST so per-file % isn't a real
                      thing the transport gives us. */}
                  {uploadProgress !== null && (
                    <>
                      <div className="absolute inset-0 rounded-xl bg-black/55 flex items-center justify-center text-[11px] font-bold text-white">
                        {uploadProgress}%
                      </div>
                      <div className="absolute bottom-0 inset-x-0 h-1 bg-black/30 rounded-b-xl overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 transition-[width] duration-150"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </>
                  )}
                  {/* Remove button hidden while uploading — tapping
                      it mid-flight would leave the in-flight request
                      orphaned and the thumbnail gone before the
                      response lands. */}
                  {uploadProgress === null && (
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      aria-label={tr('Remove photo', 'إزالة الصورة', 'تصویر ہٹائیں')}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                    >
                      <FiX className="w-3 h-3" />
                    </button>
                  )}
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

        {/* "I'm the owner" affordance. Toggling this on tells the
            mod to evaluate this submission as both a place add AND
            a claim — same person, one decision, one review.
            Without this, owners had to submit, wait for approval,
            then file a separate claim request — two reviews for
            what's effectively one event. */}
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 p-3 space-y-2">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={claimAsOwner}
              onChange={(e) => setClaimAsOwner(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-amber-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
            />
            <div className="flex-1 leading-tight">
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                🏪 {tr(
                  'I am the owner of this place',
                  'أنا صاحب هذا المكان',
                  'میں اس جگہ کا مالک ہوں',
                )}
              </p>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-300/70 mt-0.5">
                {tr(
                  "The moderator will review your ownership claim together with the place. Approval means you'll manage this listing.",
                  'سيراجع المشرف طلب الإدارة مع المكان معاً. الموافقة تعني أنك ستدير هذه الصفحة.',
                  'موڈریٹر آپ کے انتظام کا دعوی جگہ کے ساتھ جائزہ لے گا۔',
                )}
              </p>
            </div>
          </label>
          {claimAsOwner && (
            <div className="pt-1">
              <span className="block text-[11px] font-medium text-amber-800 dark:text-amber-200 mb-1">
                {tr(
                  'Proof of ownership (helps the moderator verify)',
                  'إثبات الملكية (يساعد المشرف في التحقق)',
                  'ملکیت کا ثبوت',
                )}
              </span>
              <textarea
                value={ownerProof}
                onChange={(e) => setOwnerProof(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={tr(
                  'e.g. The phone number above is mine — call to confirm.',
                  'مثال: رقم الجوال أعلاه لي — اتصلوا للتأكيد.',
                  'مثلاً: اوپر دیا گیا فون نمبر میرا ہے۔',
                )}
                className="w-full p-2.5 rounded-xl bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-800/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>
          )}
        </div>

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full py-3 mt-2 rounded-2xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform"
        >
          {submitting
            ? tr('Submitting…', 'جاري الإرسال…', 'بھیج رہا ہے…')
            : claimAsOwner
              ? tr('Submit + claim ownership', 'إرسال مع طلب الإدارة', 'بھیجیں + ملکیت دعوی')
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

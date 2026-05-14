'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import type { PlaceCategory } from '@prisma/client'
import { useLanguage } from '@/hooks/useLanguage'
import { PLACE_CATEGORIES } from '@/lib/places/categories'

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

  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  async function submit() {
    if (submitting) return
    if (!name.trim()) {
      toast.error(tr('Name required', 'الاسم مطلوب', 'نام درکار ہے'))
      return
    }
    setSubmitting(true)
    try {
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
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-[640px] mx-auto px-4 py-4 space-y-3">
        <Link href="/directory" className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
          {lang !== 'en' ? '→' : '←'} {tr('Back', 'رجوع', 'واپس')}
        </Link>
        <header className="space-y-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {tr('Add a place', 'إضافة مكان', 'جگہ شامل کریں')}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {tr(
              'Your submission will be reviewed by a moderator before appearing in the directory.',
              'سيتم مراجعة طلبك من المشرف قبل ظهوره في الدليل.',
              'آپ کی درخواست کا جائزہ موڈریٹر لے گا۔',
            )}
          </p>
        </header>

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

        <Field label={tr('Opening hours (optional)', 'ساعات العمل (اختياري)', 'اوقات کار (اختیاری)')}>
          <input value={openingHours} onChange={(e) => setOpeningHours(e.target.value)} maxLength={300} className="input-field" />
        </Field>

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full py-3 mt-2 rounded-2xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform"
        >
          {submitting
            ? tr('Submitting…', 'جاري الإرسال…', 'بھیج رہا ہے…')
            : tr('Submit for review', 'إرسال للمراجعة', 'جائزے کیلئے بھیجیں')}
        </button>

        <p className="text-[11px] text-gray-400 text-center mt-2">
          {tr(
            'Images can be added by a moderator after approval.',
            'يمكن للمشرف إضافة الصور بعد الموافقة.',
            'موڈریٹر منظوری کے بعد تصاویر شامل کر سکتا ہے۔',
          )}
        </p>
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

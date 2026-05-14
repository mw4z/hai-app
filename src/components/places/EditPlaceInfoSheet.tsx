'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import type { PlaceCategory } from '@prisma/client'
import { useLanguage } from '@/hooks/useLanguage'
import { PLACE_CATEGORIES } from '@/lib/places/categories'
import type { PublicPlace } from '@/lib/places/serialize'

interface Props {
  place: PublicPlace
  /** Whether the viewer can also edit the sensitive identity
   *  fields (name / category / addressText / mapUrl). Mirrors
   *  the API's gate: admin pre-claim only. Non-admin owners get
   *  the regular fields (description / phone / whatsapp /
   *  website / instagram / openingHours) but NOT these. */
  canEditSensitive: boolean
  open: boolean
  onClose: () => void
  onSaved: (next: Partial<PublicPlace>) => void
}

/** Bottom-sheet form for editing a place's text fields. Mirrors
 *  the create form's layout so the user has a consistent mental
 *  model. The set of visible fields adapts to permission:
 *
 *   - Owner of a claimed place: regular fields only.
 *   - Admin / creator of an unclaimed place: ALL fields,
 *     including the sensitive identity fields (name / category
 *     / addressText / mapUrl).
 *
 *  Diffing: only fields the user actually changed are sent in
 *  the PATCH body, so the server doesn't get spurious overwrites
 *  on untouched fields. */
export default function EditPlaceInfoSheet({
  place,
  canEditSensitive,
  open,
  onClose,
  onSaved,
}: Props) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  // Initialize from the current place. Stored as local state so the
  // user can edit + cancel without affecting the parent.
  const [name, setName] = useState(place.name)
  const [category, setCategory] = useState<PlaceCategory>(place.category as PlaceCategory)
  const [addressText, setAddressText] = useState(place.addressText ?? '')
  const [mapUrl, setMapUrl] = useState(place.mapUrl ?? '')
  const [phone, setPhone] = useState(place.phone ?? '')
  const [whatsapp, setWhatsapp] = useState(place.whatsapp ?? '')
  const [website, setWebsite] = useState(place.website ?? '')
  const [instagram, setInstagram] = useState(place.instagram ?? '')
  const [description, setDescription] = useState(place.description ?? '')
  const [openingHours, setOpeningHours] = useState(place.openingHours ?? '')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      // Build a diff — only changed fields go to the server. Null-
      // ish values are sent as empty string so the server can clear
      // them (the API converts '' → null on the way to Prisma).
      const body: Record<string, unknown> = {}
      if (canEditSensitive) {
        if (name !== place.name) body.name = name
        if (category !== place.category) body.category = category
        if (addressText !== (place.addressText ?? '')) body.addressText = addressText
        if (mapUrl !== (place.mapUrl ?? '')) body.mapUrl = mapUrl
      }
      if (phone !== (place.phone ?? '')) body.phone = phone
      if (whatsapp !== (place.whatsapp ?? '')) body.whatsapp = whatsapp
      if (website !== (place.website ?? '')) body.website = website
      if (instagram !== (place.instagram ?? '')) body.instagram = instagram
      if (description !== (place.description ?? '')) body.description = description
      if (openingHours !== (place.openingHours ?? '')) body.openingHours = openingHours

      if (Object.keys(body).length === 0) {
        toast(tr('No changes', 'لا توجد تعديلات', 'کوئی تبدیلیاں نہیں'))
        onClose()
        return
      }

      const res = await fetch(`/api/directory/${place.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error || tr('Save failed', 'فشل الحفظ', 'محفوظ ناکام'))
        return
      }
      toast.success(tr('Saved', 'تم الحفظ', 'محفوظ ہو گیا'))
      onSaved({
        name: body.name as string | undefined ?? place.name,
        category: (body.category as PlaceCategory | undefined) ?? place.category,
        addressText: 'addressText' in body ? (addressText || null) : place.addressText,
        mapUrl: 'mapUrl' in body ? (mapUrl || null) : place.mapUrl,
        phone: 'phone' in body ? (phone || null) : place.phone,
        whatsapp: 'whatsapp' in body ? (whatsapp || null) : place.whatsapp,
        website: 'website' in body ? (website || null) : place.website,
        instagram: 'instagram' in body ? (instagram || null) : place.instagram,
        description: 'description' in body ? (description || null) : place.description,
        openingHours: 'openingHours' in body ? (openingHours || null) : place.openingHours,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] max-h-[88vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-t-3xl p-4 space-y-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
      >
        <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-1" />
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">
          ✏️ {tr('Edit info', 'تعديل المعلومات', 'معلومات ترمیم')}
        </h3>

        {canEditSensitive && (
          <>
            <Field label={tr('Name', 'الاسم', 'نام')}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="input-field"
              />
            </Field>
            <Field label={tr('Category', 'التصنيف', 'زمرہ')}>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as PlaceCategory)}
                className="input-field"
              >
                {PLACE_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.emoji} {lang === 'en' ? c.labelEn : lang === 'ur' ? c.labelUr : c.labelAr}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={tr('Address', 'العنوان', 'پتہ')}>
              <input
                value={addressText}
                onChange={(e) => setAddressText(e.target.value)}
                maxLength={200}
                className="input-field"
              />
            </Field>
            <Field label={tr('Map URL', 'رابط الخريطة', 'نقشہ لنک')}>
              <input
                value={mapUrl}
                onChange={(e) => setMapUrl(e.target.value)}
                dir="ltr"
                placeholder="https://maps.google.com/..."
                className="input-field"
              />
            </Field>
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Field label={tr('Phone', 'الجوال', 'فون')}>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" placeholder="05xxxxxxxx" className="input-field" />
          </Field>
          <Field label={tr('WhatsApp', 'واتساب', 'واٹس ایپ')}>
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} dir="ltr" placeholder="05xxxxxxxx" className="input-field" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label={tr('Website', 'الموقع', 'ویب سائٹ')}>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} dir="ltr" placeholder="https://" className="input-field" />
          </Field>
          <Field label="Instagram">
            <input value={instagram} onChange={(e) => setInstagram(e.target.value)} dir="ltr" placeholder="@handle" className="input-field" />
          </Field>
        </div>

        <Field label={tr('Description', 'الوصف', 'تفصیل')}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            className="input-field resize-none"
          />
        </Field>

        <Field label={tr('Opening hours', 'ساعات العمل', 'اوقات کار')}>
          <input
            value={openingHours}
            onChange={(e) => setOpeningHours(e.target.value)}
            maxLength={300}
            placeholder={tr('e.g. Daily 9 AM - 10 PM', 'مثال: يومياً 9 ص - 10 م', 'مثلاً: روزانہ 9 ص - 10 ش')}
            className="input-field"
          />
        </Field>

        <div className="flex gap-2 pt-2 sticky bottom-0 bg-white dark:bg-gray-800 pb-1">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform"
          >
            {saving
              ? tr('Saving…', 'جاري الحفظ…', 'محفوظ ہو رہا ہے…')
              : tr('Save', 'حفظ', 'محفوظ کریں')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400"
          >
            {tr('Cancel', 'إلغاء', 'منسوخ')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</span>
      {children}
    </label>
  )
}

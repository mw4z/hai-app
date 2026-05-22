'use client'

import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import type { PlaceCategory } from '@prisma/client'
import { useLanguage } from '@/hooks/useLanguage'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { PLACE_CATEGORIES } from '@/lib/places/categories'
import OpeningHoursPicker from '@/components/places/OpeningHoursPicker'
import type { PublicPlace } from '@/lib/places/serialize'

// Swipe-down-to-dismiss thresholds (shared with the filter sheet).
const SWIPE_CLOSE_THRESHOLD = 100
const SWIPE_MAX_TRAVEL = 360

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
  const [snapchat, setSnapchat] = useState(place.snapchat ?? '')
  const [tiktok, setTiktok] = useState(place.tiktok ?? '')
  const [twitter, setTwitter] = useState(place.x ?? '')
  const [description, setDescription] = useState(place.description ?? '')
  const [openingHours, setOpeningHours] = useState(place.openingHours ?? '')

  // Manual status pill. Three discrete states the editor cares
  // about:
  //   - "" (empty)         → no override; auto pill from openingHours
  //   - one of MANUAL_STATUS_PRESETS → owner picked a preset
  //   - any other string   → owner used the "custom" option
  // The "until" picker is rendered as a yyyy-mm-dd <input> in the
  // local timezone; on save we ISO-stringify it for the API.
  const [manualStatus, setManualStatus] = useState(place.manualStatus ?? '')
  const [manualStatusUntil, setManualStatusUntil] = useState(() => {
    if (!place.manualStatusUntil) return ''
    const d = new Date(place.manualStatusUntil)
    if (Number.isNaN(d.getTime())) return ''
    // <input type="date"> wants YYYY-MM-DD in local time.
    const y = d.getFullYear().toString().padStart(4, '0')
    const m = (d.getMonth() + 1).toString().padStart(2, '0')
    const day = d.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${day}`
  })

  const [saving, setSaving] = useState(false)

  // Swipe-down-to-dismiss. dragY follows the finger (≥0 only);
  // animating disables the transition while dragging so the sheet
  // tracks the touch, re-enabled on release for the spring/fly-out.
  const [dragY, setDragY] = useState(0)
  const [animating, setAnimating] = useState(true)
  const dragStartY = useRef<number | null>(null)
  useEffect(() => {
    if (open) { setDragY(0); setAnimating(true) }
  }, [open])

  // Freeze background scroll while the sheet is open. Same shared
  // hook used by ImageLightbox / AttachmentMenu so behavior is
  // consistent across every modal surface in the app.
  useBodyScrollLock(open)

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
      if (snapchat !== (place.snapchat ?? '')) body.snapchat = snapchat
      if (tiktok !== (place.tiktok ?? '')) body.tiktok = tiktok
      if (twitter !== (place.x ?? '')) body.x = twitter
      if (description !== (place.description ?? '')) body.description = description
      if (openingHours !== (place.openingHours ?? '')) body.openingHours = openingHours

      // Manual status diff. Send both fields when either has
      // changed so the server's "clearing manualStatus also
      // wipes manualStatusUntil" rule doesn't fight us. When
      // the editor clears the status, we send manualStatusUntil
      // = null too (clean slate).
      const initialManualStatus = place.manualStatus ?? ''
      const initialUntil = place.manualStatusUntil
        ? new Date(place.manualStatusUntil).toISOString().slice(0, 10)
        : ''
      if (manualStatus !== initialManualStatus || manualStatusUntil !== initialUntil) {
        body.manualStatus = manualStatus
        if (!manualStatus) {
          body.manualStatusUntil = null
        } else if (manualStatusUntil) {
          // Treat the date as end-of-day local time so "set until
          // Sunday" means "expires after Sunday is over".
          const d = new Date(`${manualStatusUntil}T23:59:59`)
          body.manualStatusUntil = Number.isNaN(d.getTime()) ? null : d.toISOString()
        } else {
          body.manualStatusUntil = null
        }
      }

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
        snapchat: 'snapchat' in body ? (snapchat || null) : place.snapchat,
        tiktok: 'tiktok' in body ? (tiktok || null) : place.tiktok,
        x: 'x' in body ? (twitter || null) : place.x,
        description: 'description' in body ? (description || null) : place.description,
        openingHours: 'openingHours' in body ? (openingHours || null) : place.openingHours,
        manualStatus: 'manualStatus' in body ? (manualStatus || null) : place.manualStatus,
        manualStatusUntil: 'manualStatusUntil' in body
          ? (body.manualStatusUntil as string | null)
          : place.manualStatusUntil,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      {/* Three-row flex column: pinned header (drag handle + title),
          scrollable form, pinned footer (Save / Cancel). The footer
          is OUTSIDE the scroll region so Android's variable viewport
          (URL bar collapse, keyboard) can't shove it around. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] max-h-[88vh] flex flex-col bg-white dark:bg-gray-800 rounded-t-3xl"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: animating ? 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
        }}
      >
        {/* Header doubles as the swipe-down-to-dismiss grab area —
            the form below scrolls, so listeners stay on the header. */}
        <div
          className="px-4 pt-3 pb-2 flex-shrink-0"
          style={{ touchAction: 'pan-y' }}
          onTouchStart={(e) => {
            dragStartY.current = e.touches[0].clientY
            setAnimating(false)
          }}
          onTouchMove={(e) => {
            if (dragStartY.current === null) return
            const delta = e.touches[0].clientY - dragStartY.current
            setDragY(delta <= 0 ? 0 : Math.min(delta, SWIPE_MAX_TRAVEL))
          }}
          onTouchEnd={() => {
            const released = dragY
            dragStartY.current = null
            setAnimating(true)
            if (released >= SWIPE_CLOSE_THRESHOLD) {
              setDragY(window.innerHeight)
              setTimeout(onClose, 200)
            } else {
              setDragY(0)
            }
          }}
        >
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-2" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            ✏️ {tr('Edit info', 'تعديل المعلومات', 'معلومات ترمیم')}
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-3">

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

        <Field label={tr('Website', 'الموقع', 'ویب سائٹ')}>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} dir="ltr" placeholder="https://" className="input-field" />
        </Field>

        <div>
          <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">
            {tr('Social handles', 'حسابات التواصل', 'سوشل ہینڈلز')}
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

        <Field label={tr('Description', 'الوصف', 'تفصیل')}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            className="input-field resize-none"
          />
        </Field>

        <div>
          <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">
            🕒 {tr('Opening hours', 'ساعات العمل', 'اوقات کار')}
          </span>
          <OpeningHoursPicker value={openingHours} onChange={setOpeningHours} />
        </div>

        {/* Manual status pill editor. Overrides the auto open/
            closed pill when set. Picking the first option clears
            both manualStatus and manualStatusUntil; the rest pre-
            fill manualStatus with the picked label. "حالة مخصصة"
            reveals a small text input for owner-supplied text. */}
        <ManualStatusSection
          status={manualStatus}
          setStatus={setManualStatus}
          until={manualStatusUntil}
          setUntil={setManualStatusUntil}
        />

        </div>
        {/* Pinned footer — flex-shrink-0 keeps it OUT of the scroll
            region so it can't move when the keyboard or URL bar
            toggles. Safe-area padding lives here (not on the scroll
            container) so the inset sits below the buttons. */}
        <div
          className="flex-shrink-0 flex gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-b-3xl"
          style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 1.5rem)' }}
        >
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

/** Preset status options. The first option, when picked, clears
 *  both manualStatus and manualStatusUntil (auto pill returns).
 *  The last option ("حالة مخصصة") reveals a freeform text input
 *  capped at 60 chars. */
const MANUAL_STATUS_PRESETS: string[] = [
  'خارج الخدمة مؤقتًا',
  'تحت الصيانة',
  'إجازة مؤقتة',
  'مزدحم الآن',
  'مغلق نهائيًا',
]

function ManualStatusSection({
  status,
  setStatus,
  until,
  setUntil,
}: {
  status: string
  setStatus: (s: string) => void
  until: string
  setUntil: (s: string) => void
}) {
  // Determine the current "mode" the picker is in by matching the
  // saved value against the presets. Anything that doesn't match
  // and isn't empty is treated as the "custom" mode.
  const isAuto = status === ''
  const isPreset = MANUAL_STATUS_PRESETS.includes(status)
  const isCustom = !isAuto && !isPreset

  return (
    <div>
      <span className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1.5">
        🚦 حالة المكان
      </span>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => { setStatus(''); setUntil('') }}
          className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
            isAuto
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          تلقائي حسب ساعات العمل
        </button>
        {MANUAL_STATUS_PRESETS.map((label) => {
          const active = status === label
          return (
            <button
              key={label}
              type="button"
              onClick={() => setStatus(label)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                active
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              {label}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => { if (!isCustom) setStatus(' ') }}
          className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
            isCustom
              ? 'bg-amber-500 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          حالة مخصصة
        </button>
      </div>

      {isCustom && (
        <input
          autoFocus
          value={status}
          onChange={(e) => setStatus(e.target.value.slice(0, 60))}
          maxLength={60}
          placeholder="اكتب الحالة (60 حرف كحد أقصى)"
          className="input-field mt-2 text-sm"
        />
      )}

      {!isAuto && (
        <div className="mt-2">
          <span className="block text-[10.5px] text-gray-500 dark:text-gray-400 mb-1">
            اختياري — يلغى تلقائياً بعد هذا التاريخ
          </span>
          {/* Compact date input — the global input-field utility
              renders an oversized control here, and iOS WKWebView
              expands <input type="date"> further on RTL pages.
              Force tight sizing + a dir="ltr" wrapper so the
              native chunks render left-to-right inside a phone-
              friendly width. Inline-block (not full-width) since
              the date itself is only ~7 chars; no point spanning
              the whole sheet. */}
          <div dir="ltr" className="inline-block">
            <input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              style={{ textAlign: 'center' }}
              className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          {until && (
            <button
              type="button"
              onClick={() => setUntil('')}
              className="ms-2 text-[11px] text-gray-400 dark:text-gray-500 underline decoration-dotted"
            >
              مسح
            </button>
          )}
        </div>
      )}
    </div>
  )
}

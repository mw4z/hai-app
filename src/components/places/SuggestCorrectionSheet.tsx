'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { FiX } from 'react-icons/fi'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { PLACE_CATEGORIES } from '@/lib/places/categories'

export interface SuggestPlace {
  id: string
  name: string
  category: string
  description: string | null
  addressText: string | null
  phone: string | null
  whatsapp: string | null
  website: string | null
  instagram: string | null
  latitude: number | null
  longitude: number | null
}

/**
 * "اقترح تصحيحًا" — a verified resident proposes corrections to a place.
 * Fields are pre-filled with current values; the server keeps only what
 * changed and routes each change to mod review (reputation on approval).
 */
export default function SuggestCorrectionSheet({
  place, open, onClose,
}: { place: SuggestPlace; open: boolean; onClose: () => void }) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) => (lang === 'en' ? en : lang === 'ur' ? ur : ar)
  useBodyScrollLock(open)

  const [f, setF] = useState({
    name: place.name ?? '',
    category: place.category ?? '',
    description: place.description ?? '',
    addressText: place.addressText ?? '',
    phone: place.phone ?? '',
    whatsapp: place.whatsapp ?? '',
    website: place.website ?? '',
    instagram: place.instagram ?? '',
    latitude: place.latitude != null ? String(place.latitude) : '',
    longitude: place.longitude != null ? String(place.longitude) : '',
  })
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }))

  if (!open || typeof document === 'undefined') return null
  const input = 'w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

  async function submit() {
    if (busy) return
    const proposed: Record<string, unknown> = {
      name: f.name, category: f.category, description: f.description, addressText: f.addressText,
      phone: f.phone, whatsapp: f.whatsapp, website: f.website, instagram: f.instagram,
    }
    if (f.latitude.trim()) proposed.latitude = f.latitude
    if (f.longitude.trim()) proposed.longitude = f.longitude
    setBusy(true)
    try {
      const res = await fetch(`/api/directory/${place.id}/suggest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposed, note: note.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || tr('Failed', 'فشل', 'ناکام')); return }
      toast.success(tr('Sent for review — thanks!', 'أُرسل للمراجعة، شكراً لك!', 'جائزے کیلئے بھیج دیا'))
      onClose()
    } catch { toast.error(tr('Connection error', 'خطأ بالاتصال', 'کنکشن خرابی')) }
    finally { setBusy(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[1100] bg-black/50 flex items-end justify-center" onClick={onClose} role="dialog" aria-modal="true">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] max-h-[88vh] flex flex-col bg-white dark:bg-gray-900 rounded-t-3xl"
        style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 1.5rem)' }}
      >
        <div className="px-4 pt-3 pb-2 flex-shrink-0 border-b border-gray-100 dark:border-gray-800">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-2" />
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">{tr('Suggest a correction', 'اقترح تصحيحًا', 'تصحیح تجویز کریں')}</h2>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400"><FiX className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {tr('Edit only what needs fixing. A moderator reviews it; approved changes earn you reputation points.',
                'عدّل ما يحتاج تصحيحًا فقط. يراجعه المشرف، والتغييرات المقبولة تكسبك نقاط سمعة.',
                'صرف وہی تبدیل کریں جو ضروری ہو۔')}
          </p>

          <Section title={tr('Basic info', 'معلومات أساسية', 'بنیادی')}>
            <input value={f.name} onChange={set('name')} placeholder={tr('Name', 'الاسم', 'نام')} className={input} />
            <select value={f.category} onChange={set('category')} className={input}>
              {PLACE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{lang === 'en' ? c.labelEn : lang === 'ur' ? c.labelUr : c.labelAr}</option>
              ))}
            </select>
            <textarea value={f.description} onChange={set('description')} rows={2} placeholder={tr('Description', 'الوصف', 'تفصیل')} className={`${input} resize-none`} />
            <input value={f.addressText} onChange={set('addressText')} placeholder={tr('Address', 'العنوان', 'پتہ')} className={input} />
          </Section>

          <Section title={tr('Contact', 'التواصل', 'رابطہ')}>
            <input value={f.phone} onChange={set('phone')} dir="ltr" placeholder={tr('Phone', 'الهاتف', 'فون')} className={input} />
            <input value={f.whatsapp} onChange={set('whatsapp')} dir="ltr" placeholder="WhatsApp" className={input} />
            <input value={f.website} onChange={set('website')} dir="ltr" placeholder={tr('Website', 'الموقع', 'ویب سائٹ')} className={input} />
            <input value={f.instagram} onChange={set('instagram')} dir="ltr" placeholder="Instagram" className={input} />
          </Section>

          <Section title={tr('Location', 'الموقع', 'مقام')}>
            <div className="flex gap-2">
              <input value={f.latitude} onChange={set('latitude')} dir="ltr" inputMode="decimal" placeholder={tr('Latitude', 'خط العرض', 'عرض البلد')} className={input} />
              <input value={f.longitude} onChange={set('longitude')} dir="ltr" inputMode="decimal" placeholder={tr('Longitude', 'خط الطول', 'طول البلد')} className={input} />
            </div>
          </Section>

          <Section title={tr('Note to reviewer (optional)', 'ملاحظة للمشرف (اختياري)', 'نوٹ')}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} placeholder={tr('Why this correction?', 'لماذا هذا التصحيح؟', '')} className={`${input} resize-none`} />
            <p className="text-[10px] text-gray-400">{tr('No links or phone numbers in the note.', 'بدون روابط أو أرقام في الملاحظة.', '')}</p>
          </Section>

          <button onClick={submit} disabled={busy} className="w-full py-3 rounded-2xl bg-primary-600 text-white font-bold text-sm disabled:opacity-50 active:scale-[0.98]">
            {busy ? tr('Sending…', 'جاري الإرسال…', '…') : tr('Send for review', 'إرسال للمراجعة', 'جائزے کیلئے بھیجیں')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{title}</p>
      {children}
    </div>
  )
}

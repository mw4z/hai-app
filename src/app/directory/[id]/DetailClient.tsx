'use client'

import { useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import type { PublicPlace } from '@/lib/places/serialize'
import { getCategoryMeta } from '@/lib/places/categories'
import PlaceStatusBadge from '@/components/places/PlaceStatusBadge'
import DirectoryHeader from '@/components/places/DirectoryHeader'
import { buildWhatsAppHref } from '@/lib/phone'

interface Props {
  place: PublicPlace
  isOwner: boolean
  isCreator: boolean
}

/** Public detail page. Renders the place's identity, contact
 *  buttons, optional map link, owner's ServiceItems if applicable,
 *  and the claim / report actions. createdByUser is NEVER shown
 *  here — only a generic "أضافه أحد سكان الحي" attribution. */
export default function DetailClient({ place, isOwner, isCreator }: Props) {
  const { lang } = useLanguage()
  const cat = getCategoryMeta(place.category)
  const categoryLabel =
    lang === 'en' ? cat.labelEn : lang === 'ur' ? cat.labelUr : cat.labelAr

  const [reportOpen, setReportOpen] = useState(false)
  const [claimOpen, setClaimOpen] = useState(false)

  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  return (
    <main className="hai-directory-screen min-h-screen bg-gray-50 dark:bg-gray-900">
      <DirectoryHeader title={place.name} backHref="/directory" />
      <div className="max-w-[640px] mx-auto px-4 py-4 space-y-4">
        {/* Back link removed — DirectoryHeader provides the back button */}

        <header className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-2">
          <div className="flex items-start gap-3">
            <span className="text-3xl leading-none" aria-hidden>{cat.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 mb-1">
                <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1">{place.name}</h1>
                <PlaceStatusBadge status={place.status} />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{categoryLabel}</p>
            </div>
          </div>

          {place.description && (
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
              {place.description}
            </p>
          )}

          {place.addressText && (
            <p className="text-sm text-gray-600 dark:text-gray-400">📍 {place.addressText}</p>
          )}

          {place.openingHours && (
            <p className="text-sm text-gray-600 dark:text-gray-400">🕒 {place.openingHours}</p>
          )}

          {/* Attribution — generic, never exposes createdByUser. */}
          <p className="text-[11px] text-gray-400 dark:text-gray-500 pt-1">
            {place.claimedByUser
              ? tr(`Managed by ${place.claimedByUser.name ?? '—'}`, `يدير هذا المكان: ${place.claimedByUser.name ?? '—'}`, `زیر انتظام: ${place.claimedByUser.name ?? '—'}`)
              : place.addedByCommunity
                ? tr('Added by a neighbor', 'أضافه أحد سكان الحي', 'محلے کے ایک رہائشی نے شامل کیا')
                : ''}
          </p>
        </header>

        {/* Image strip — only renders when the place has photos.
            Horizontal scroll keeps the page flowing on narrow
            screens; each image opens in a new tab on tap for a
            full-size view. */}
        {place.imageUrls && place.imageUrls.length > 0 && (
          <div className="-mx-4 px-4 overflow-x-auto">
            <div className="flex gap-2">
              {place.imageUrls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 block"
                >
                  <img
                    src={url}
                    alt=""
                    className="h-44 w-auto rounded-2xl object-cover border border-gray-200 dark:border-gray-700"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Contact + map row */}
        <div className="grid grid-cols-2 gap-2">
          {place.phone && (
            <a href={`tel:${place.phone}`} className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-100 active:scale-95">
              📞 {tr('Call', 'اتصال', 'کال')}
            </a>
          )}
          {place.whatsapp && (() => {
            // Saudi phones can arrive in many shapes (05..., 5...,
            // +966..., 966..., 00966...). buildWhatsAppHref
            // normalizes everything to the bare-digit international
            // form wa.me requires. Hide the button if it can't make
            // a valid href rather than ship a broken link.
            const href = buildWhatsAppHref(place.whatsapp)
            if (!href) return null
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/60 text-sm font-semibold text-emerald-700 dark:text-emerald-300 active:scale-95">
                💬 {tr('WhatsApp', 'واتساب', 'واٹس ایپ')}
              </a>
            )
          })()}
          {(place.mapUrl || (place.latitude && place.longitude)) && (
            <a
              href={place.mapUrl || `https://maps.google.com/?q=${place.latitude},${place.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="col-span-2 flex items-center justify-center gap-2 py-3 rounded-2xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800/60 text-sm font-semibold text-sky-700 dark:text-sky-300 active:scale-95"
            >
              🗺️ {tr('Open map', 'فتح الخريطة', 'نقشہ کھولیں')}
            </a>
          )}
        </div>

        {/* Owner's ServiceItems if the place is claimed by a provider */}
        {place.ownerServiceItems && place.ownerServiceItems.length > 0 && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-2.5">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">
              {tr('Services here', 'خدمات هذا المكان', 'یہاں خدمات')}
            </h2>
            <ul className="space-y-1.5">
              {place.ownerServiceItems.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{s.title}</p>
                    {s.description && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.description}</p>}
                  </div>
                  {s.price !== null && (
                    <span className="text-xs font-semibold text-primary-700 dark:text-primary-300 flex-shrink-0">
                      {s.price}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Owner controls (limited-field edit deferred to a follow-up form) */}
        {isOwner && (
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-xs text-emerald-700 dark:text-emerald-300">
            {tr(
              'You manage this place. Editing tools are coming soon.',
              'أنت تدير هذا المكان. أدوات التحرير ستتوفر قريباً.',
              'آپ اس جگہ کا انتظام کرتے ہیں۔ ترمیم کے ٹولز جلد دستیاب ہوں گے۔',
            )}
          </div>
        )}

        {/* Action footer */}
        <div className="flex flex-wrap gap-2">
          {!isOwner && !isCreator && (
            <button
              type="button"
              onClick={() => setClaimOpen(true)}
              className="flex-1 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 active:scale-95"
            >
              {tr('Is this your place?', 'هل هذا مكانك؟', 'کیا یہ آپ کی جگہ ہے؟')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="flex-1 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 active:scale-95"
          >
            {tr('Report wrong info', 'الإبلاغ عن معلومة خاطئة', 'غلط معلومات کی اطلاع')}
          </button>
        </div>

        {/* Claim / report sheets are wired up in Stage D */}
        {claimOpen && (
          <ClaimSheet placeId={place.id} onClose={() => setClaimOpen(false)} />
        )}
        {reportOpen && (
          <ReportSheet placeId={place.id} onClose={() => setReportOpen(false)} />
        )}
      </div>
    </main>
  )
}

/** Placeholder sheets — populated in Stage D. */
function ClaimSheet({ placeId, onClose }: { placeId: string; onClose: () => void }) {
  const { lang } = useLanguage()
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)
  async function submit() {
    if (sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/directory/${placeId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(lang === 'en' ? 'Claim submitted' : 'تم إرسال الطلب')
        onClose()
      } else {
        toast.error(d?.error || 'حدث خطأ')
      }
    } catch {
      toast.error('فشل الاتصال')
    } finally { setSending(false) }
  }
  return (
    <SheetShell title={lang === 'en' ? 'Claim this place' : 'إدارة هذا المكان'} onClose={onClose}>
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        rows={4}
        placeholder={lang === 'en' ? 'How can we verify you own this place?' : 'كيف نتأكد أن هذا مكانك؟'}
        className="w-full p-3 rounded-xl bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      <button
        onClick={submit}
        disabled={sending}
        className="mt-3 w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
      >
        {sending ? '...' : (lang === 'en' ? 'Send request' : 'إرسال الطلب')}
      </button>
    </SheetShell>
  )
}

function ReportSheet({ placeId, onClose }: { placeId: string; onClose: () => void }) {
  const { lang } = useLanguage()
  const [type, setType] = useState('WRONG_INFO')
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)
  const TYPES: { v: string; ar: string; en: string }[] = [
    { v: 'WRONG_INFO',     ar: 'معلومة خاطئة',   en: 'Wrong info' },
    { v: 'CLOSED',         ar: 'المكان مغلق',    en: 'Closed' },
    { v: 'DUPLICATE',      ar: 'مكرر',           en: 'Duplicate' },
    { v: 'WRONG_LOCATION', ar: 'موقع خاطئ',      en: 'Wrong location' },
    { v: 'WRONG_PHONE',    ar: 'رقم خاطئ',       en: 'Wrong phone' },
    { v: 'SPAM',           ar: 'إعلان/سبام',     en: 'Spam' },
    { v: 'OTHER',          ar: 'أخرى',           en: 'Other' },
  ]
  async function submit() {
    if (sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/directory/${placeId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message: msg }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(lang === 'en' ? 'Reported' : 'تم الإبلاغ')
        onClose()
      } else {
        toast.error(d?.error || 'حدث خطأ')
      }
    } catch {
      toast.error('فشل الاتصال')
    } finally { setSending(false) }
  }
  return (
    <SheetShell title={lang === 'en' ? 'Report wrong info' : 'الإبلاغ عن معلومة خاطئة'} onClose={onClose}>
      <select value={type} onChange={(e) => setType(e.target.value)} className="w-full p-2.5 rounded-xl bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm">
        {TYPES.map((t) => (
          <option key={t.v} value={t.v}>{lang === 'en' ? t.en : t.ar}</option>
        ))}
      </select>
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        rows={3}
        placeholder={lang === 'en' ? 'Additional details (optional)' : 'تفاصيل إضافية (اختياري)'}
        className="mt-2 w-full p-3 rounded-xl bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      <button
        onClick={submit}
        disabled={sending}
        className="mt-3 w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
      >
        {sending ? '...' : (lang === 'en' ? 'Submit' : 'إرسال')}
      </button>
    </SheetShell>
  )
}

function SheetShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[480px] bg-white dark:bg-gray-800 rounded-t-3xl p-4 space-y-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}>
        <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-3" />
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">{title}</h3>
        {children}
      </div>
    </div>
  )
}

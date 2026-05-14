'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import type { PublicPlace } from '@/lib/places/serialize'
import { getCategoryMeta } from '@/lib/places/categories'
import PlaceStatusBadge from '@/components/places/PlaceStatusBadge'
import DirectoryHeader from '@/components/places/DirectoryHeader'
import EditPhotosSheet from '@/components/places/EditPhotosSheet'
import EditPlaceInfoSheet from '@/components/places/EditPlaceInfoSheet'
import ImageLightbox from '@/components/ImageLightbox'
import { buildWhatsAppHref } from '@/lib/phone'

interface Props {
  place: PublicPlace
  isOwner: boolean
  isCreator: boolean
  /** Whether the viewer can add/remove photos. Mirrors the PATCH
   *  route: claimed owner always; creator + admins/mods only when
   *  no one has claimed yet. */
  canEditPhotos: boolean
  /** Whether the viewer can edit the regular owner-editable text
   *  fields (description, phone, whatsapp, website, instagram,
   *  openingHours). Same gate as canEditPhotos. */
  canEditInfo: boolean
  /** Whether the viewer can also edit the SENSITIVE identity
   *  fields (name / category / addressText / mapUrl). Admin
   *  pre-claim only. */
  canEditSensitive: boolean
}

/** Public detail page. Renders the place's identity, contact
 *  buttons, optional map link, owner's ServiceItems if applicable,
 *  and the claim / report actions. createdByUser is NEVER shown
 *  here — only a generic "أضافه أحد سكان الحي" attribution. */
export default function DetailClient({
  place: serverPlace,
  isOwner,
  isCreator,
  canEditPhotos,
  canEditInfo,
  canEditSensitive,
}: Props) {
  // Place data + local override. The text-edit sheet patches
  // individual fields; we merge them into a local copy so the
  // detail page re-renders the new values without router.refresh().
  const [localPlace, setLocalPlace] = useState<PublicPlace>(serverPlace)
  const place = localPlace
  const router = useRouter()
  const { lang } = useLanguage()
  const cat = getCategoryMeta(place.category)
  const categoryLabel =
    lang === 'en' ? cat.labelEn : lang === 'ur' ? cat.labelUr : cat.labelAr

  const [reportOpen, setReportOpen] = useState(false)
  const [claimOpen, setClaimOpen] = useState(false)
  const [photoEditOpen, setPhotoEditOpen] = useState(false)
  const [infoEditOpen, setInfoEditOpen] = useState(false)
  // Lightbox: index of the photo the user tapped (null = closed).
  // Using the shared ImageLightbox keeps photos in-app — tapping
  // opens the same gesture-driven viewer the chat + post detail
  // surfaces use, instead of bouncing to the system browser via
  // target="_blank".
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  // Local override for imageUrls so the EditPhotosSheet save can
  // reflect immediately without a router.refresh(). Falls back
  // to the server-rendered list when null.
  const [localImageUrls, setLocalImageUrls] = useState<string[] | null>(null)
  const displayImageUrls = localImageUrls ?? place.imageUrls

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
        {displayImageUrls && displayImageUrls.length > 0 && (
          <div className="-mx-4 px-4 overflow-x-auto">
            <div className="flex gap-2">
              {displayImageUrls.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="flex-shrink-0 block active:scale-[0.98] transition-transform"
                >
                  <img
                    src={url}
                    alt=""
                    className="h-44 w-auto rounded-2xl object-cover border border-gray-200 dark:border-gray-700"
                  />
                </button>
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
          {(place.mapUrl || (place.latitude && place.longitude)) && (() => {
            const url = place.mapUrl || `https://maps.google.com/?q=${place.latitude},${place.longitude}`
            return (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={async (e) => {
                  // Native bug fix: on Capacitor Android the bare
                  // <a target="_blank"> tries to navigate WITHIN the
                  // WebView (which is bound to app.hai-app.net), and
                  // Capacitor's errorPath:'offline.html' kicks in
                  // when the cross-origin load gets blocked — user
                  // saw "no connection" instead of the map. Same
                  // pattern PdfTile uses: intercept the tap on
                  // native, hand the URL to @capacitor/browser so
                  // it opens in a Custom Tab / SFSafariViewController
                  // overlay on top of the app. Web falls through to
                  // the default new-tab behaviour.
                  if (typeof window === 'undefined') return
                  if (!window.Capacitor?.isNativePlatform()) return
                  e.preventDefault()
                  try {
                    const { Browser } = await import('@capacitor/browser')
                    await Browser.open({ url, presentationStyle: 'popover' })
                  } catch {
                    try { window.open(url, '_blank', 'noopener,noreferrer') } catch {}
                  }
                }}
                className="col-span-2 flex items-center justify-center gap-2 py-3 rounded-2xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800/60 text-sm font-semibold text-sky-700 dark:text-sky-300 active:scale-95"
              >
                🗺️ {tr('Open map', 'فتح الخريطة', 'نقشہ کھولیں')}
              </a>
            )
          })()}
        </div>

        {/* Social links row — only renders the platforms that
            actually have a value. Each is a tiny pill so up to four
            of them fit on a single line on phone widths. The handle
            is normalized to a real URL; bare @handles get expanded
            to the platform's own profile path. */}
        {(place.website || place.instagram || place.snapchat || place.tiktok || place.x) && (
          <div className="flex flex-wrap gap-2">
            {place.website && (
              <a href={place.website} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200 active:scale-95">
                🌐 {tr('Website', 'الموقع', 'ویب سائٹ')}
              </a>
            )}
            {place.instagram && (
              <a href={socialHref('instagram', place.instagram)} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-xl bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800/60 text-xs font-medium text-pink-700 dark:text-pink-300 active:scale-95">
                📷 Instagram
              </a>
            )}
            {place.snapchat && (
              <a href={socialHref('snapchat', place.snapchat)} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/60 text-xs font-medium text-yellow-800 dark:text-yellow-300 active:scale-95">
                👻 Snapchat
              </a>
            )}
            {place.tiktok && (
              <a href={socialHref('tiktok', place.tiktok)} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-800 dark:text-gray-200 active:scale-95">
                🎵 TikTok
              </a>
            )}
            {place.x && (
              <a href={socialHref('x', place.x)} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-800 dark:text-gray-200 active:scale-95">
                ✕ X
              </a>
            )}
          </div>
        )}

        {/* Owner-only "Edit catalog" banner.
            Renders above the services list when the viewer is
            the claimed owner of this place. Copy and CTA shift
            based on whether they've already added items:
              - has items: "هذه الخدمات تظهر من كتالوجك …"
              - empty:     "لم تضف خدمات لهذا المكان بعد."
            The deep-link carries ?from=place so the catalog
            editor knows to show its place-aware banner +
            visibility toggles. */}
        {isOwner && (
          <section className="bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl p-3 flex items-start gap-3">
            <span className="text-xl flex-shrink-0" aria-hidden>📋</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-emerald-900 dark:text-emerald-100 leading-relaxed">
                {place.ownerServiceItems && place.ownerServiceItems.length > 0
                  ? 'هذه الخدمات تظهر من كتالوجك كمقدم خدمة.'
                  : 'لم تضف خدمات لهذا المكان بعد.'}
              </p>
              <button
                type="button"
                onClick={() => router.push('/profile/catalog?from=place')}
                className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-emerald-700 dark:text-emerald-300 active:scale-95 transition-transform"
              >
                {place.ownerServiceItems && place.ownerServiceItems.length > 0
                  ? 'تعديل الكتالوج'
                  : 'إضافة خدمات'}
                <span aria-hidden>←</span>
              </button>
            </div>
          </section>
        )}

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

        {/* Edit-photos affordance.
            Visible to anyone the PATCH route would accept:
              - claimed owner (always)
              - creator while the place is unclaimed
              - mods of this nbhd / PLATFORM_MOD / SUPER_ADMIN
                while the place is unclaimed
            The header label adapts so each role sees the right
            context: claimed owner gets the "you manage this
            place" badge; admins / creators get a more neutral
            "manage photos" framing. */}
        {(canEditPhotos || canEditInfo) && (
          <div className={`rounded-2xl border p-3 space-y-2 ${
            isOwner
              ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-900/20'
              : 'border-sky-200 dark:border-sky-800/60 bg-sky-50 dark:bg-sky-900/20'
          }`}>
            <p className={`text-xs font-semibold ${
              isOwner
                ? 'text-emerald-800 dark:text-emerald-200'
                : 'text-sky-800 dark:text-sky-200'
            }`}>
              {isOwner
                ? `✓ ${tr('You manage this place', 'أنت تدير هذا المكان', 'آپ اس جگہ کا انتظام کرتے ہیں')}`
                : isCreator
                  ? `📝 ${tr('You added this place', 'أضفت هذا المكان', 'آپ نے یہ جگہ شامل کی')}`
                  : `🛠️ ${tr('Admin tools', 'أدوات المشرف', 'ایڈمن ٹولز')}`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {canEditPhotos && (
                <button
                  type="button"
                  onClick={() => setPhotoEditOpen(true)}
                  className={`py-2 rounded-xl text-white text-xs font-semibold active:scale-95 transition-transform ${
                    isOwner ? 'bg-emerald-600' : 'bg-sky-600'
                  }`}
                >
                  📷 {tr(
                    displayImageUrls.length > 0 ? 'Edit photos' : 'Add photos',
                    displayImageUrls.length > 0 ? 'تعديل الصور' : 'إضافة صور',
                    displayImageUrls.length > 0 ? 'تصاویر ترمیم کریں' : 'تصاویر شامل کریں',
                  )}
                </button>
              )}
              {canEditInfo && (
                <button
                  type="button"
                  onClick={() => setInfoEditOpen(true)}
                  className={`py-2 rounded-xl text-white text-xs font-semibold active:scale-95 transition-transform ${
                    isOwner ? 'bg-emerald-600' : 'bg-sky-600'
                  }`}
                >
                  ✏️ {tr('Edit info', 'تعديل المعلومات', 'معلومات ترمیم')}
                </button>
              )}
            </div>
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

        {/* Claim / report sheets */}
        {claimOpen && (
          <ClaimSheet placeId={place.id} onClose={() => setClaimOpen(false)} />
        )}
        {reportOpen && (
          <ReportSheet placeId={place.id} onClose={() => setReportOpen(false)} />
        )}
        {/* Photo-edit sheet — mounted for any allowed editor
            (claimed owner, creator pre-claim, mod-of-nbhd / admin
            pre-claim). onSaved updates the local override so the
            strip reflects the new list without a route refresh. */}
        {canEditPhotos && (
          <EditPhotosSheet
            placeId={place.id}
            initialUrls={displayImageUrls}
            open={photoEditOpen}
            onClose={() => setPhotoEditOpen(false)}
            onSaved={(urls) => {
              setLocalImageUrls(urls)
              setPhotoEditOpen(false)
            }}
          />
        )}
        {canEditInfo && (
          <EditPlaceInfoSheet
            place={place}
            canEditSensitive={canEditSensitive}
            open={infoEditOpen}
            onClose={() => setInfoEditOpen(false)}
            onSaved={(diff) => {
              // Merge the patched fields into the local place so the
              // detail page re-renders without a route refresh.
              setLocalPlace((prev) => ({ ...prev, ...diff }))
              setInfoEditOpen(false)
            }}
          />
        )}
      </div>
      {/* In-app image viewer. Same lightbox the chat / post detail
          surfaces use — swipe down to close, pinch / double-tap
          zoom, horizontal swipe between photos. Replaces the
          previous `target=_blank` anchors that kicked the user
          out to Safari / Chrome on Capacitor native. */}
      {displayImageUrls.length > 0 && (
        <ImageLightbox
          images={displayImageUrls}
          initialIndex={lightboxIndex ?? 0}
          open={lightboxIndex !== null}
          onClose={() => setLightboxIndex(null)}
        />
      )}
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

/** Normalize a stored social value into a clickable URL. Owners
 *  can store either a full https URL or a bare handle ("@hai",
 *  "hai"). We never assume a bare value is safe to embed in a path
 *  blindly — we strip leading @ and pass through encodeURIComponent
 *  so weird characters can't break out of the URL. */
function socialHref(platform: 'instagram' | 'snapchat' | 'tiktok' | 'x', raw: string): string {
  const v = raw.trim()
  if (v.startsWith('http://') || v.startsWith('https://')) return v
  const handle = encodeURIComponent(v.replace(/^@+/, ''))
  switch (platform) {
    case 'instagram': return `https://instagram.com/${handle}`
    case 'snapchat':  return `https://snapchat.com/add/${handle}`
    case 'tiktok':    return `https://tiktok.com/@${handle}`
    case 'x':         return `https://x.com/${handle}`
  }
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

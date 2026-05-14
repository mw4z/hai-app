'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { PlaceCategory, PlaceReportType } from '@prisma/client'
import { useLanguage } from '@/hooks/useLanguage'
import { getCategoryMeta } from '@/lib/places/categories'
import type { ModPlace } from '@/lib/places/serialize'
import DirectoryHeader from '@/components/places/DirectoryHeader'
import { buildWhatsAppHref } from '@/lib/phone'

interface PendingClaim {
  id: string
  message: string | null
  createdAt: string
  user: { id: string; name: string | null; providerStatus: string; reputation: number }
  place: { id: string; name: string; category: PlaceCategory; status: string }
}

interface RecentReport {
  id: string
  type: PlaceReportType
  message: string | null
  createdAt: string
  reporter: { id: string; name: string | null }
  place: { id: string; name: string; category: PlaceCategory; status: string }
}

interface Props {
  data: {
    pendingPlaces: ModPlace[]
    pendingClaims: PendingClaim[]
    recentReports: RecentReport[]
  }
}

type Tab = 'places' | 'claims' | 'reports'

export default function ModDirectoryClient({ data }: Props) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  const [tab, setTab] = useState<Tab>('places')
  const [pendingPlaces, setPendingPlaces] = useState(data.pendingPlaces)
  const [pendingClaims, setPendingClaims] = useState(data.pendingClaims)

  return (
    <main className="hai-directory-screen min-h-screen bg-gray-50 dark:bg-gray-900">
      <DirectoryHeader
        title={tr('Directory review', 'دليل الحي — مراجعة', 'ڈائریکٹری جائزہ')}
        backHref="/mod"
      />
      <div className="max-w-[760px] mx-auto px-4 py-4 space-y-4">

        <div className="flex gap-2 overflow-x-auto pb-1">
          <TabBtn active={tab === 'places'}  onClick={() => setTab('places')}  label={tr('Pending places', 'طلبات الدليل', 'زیر التواء جگہیں')}  count={pendingPlaces.length} />
          <TabBtn active={tab === 'claims'}  onClick={() => setTab('claims')}  label={tr('Pending claims', 'طلبات الإدارة', 'انتظامی دعوے')} count={pendingClaims.length} />
          <TabBtn active={tab === 'reports'} onClick={() => setTab('reports')} label={tr('Place reports', 'بلاغات الأماكن', 'جگہ کی شکایات')} count={data.recentReports.length} />
        </div>

        {tab === 'places' && (
          <div className="space-y-3">
            {pendingPlaces.length === 0
              ? <Empty label={tr('No pending places.', 'لا توجد طلبات معلّقة.', 'کوئی زیر التواء جگہ نہیں۔')} />
              : pendingPlaces.map((p) => (
                  <PlaceRow
                    key={p.id}
                    place={p}
                    onResolve={(id) => setPendingPlaces((prev) => prev.filter((x) => x.id !== id))}
                  />
                ))}
          </div>
        )}

        {tab === 'claims' && (
          <div className="space-y-3">
            {pendingClaims.length === 0
              ? <Empty label={tr('No pending claims.', 'لا توجد طلبات إدارة.', 'کوئی دعوی نہیں۔')} />
              : pendingClaims.map((c) => (
                  <ClaimRow
                    key={c.id}
                    claim={c}
                    onResolve={(id) => setPendingClaims((prev) => prev.filter((x) => x.id !== id))}
                  />
                ))}
          </div>
        )}

        {tab === 'reports' && (
          <div className="space-y-3">
            {data.recentReports.length === 0
              ? <Empty label={tr('No recent reports.', 'لا توجد بلاغات.', 'کوئی شکایت نہیں۔')} />
              : data.recentReports.map((r) => <ReportRow key={r.id} report={r} />)}
          </div>
        )}
      </div>
    </main>
  )
}

function TabBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${
        active ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
      }`}
    >
      {label}{count > 0 ? ` (${count})` : ''}
    </button>
  )
}

function Empty({ label }: { label: string }) {
  return <p className="text-center text-sm text-gray-500 py-8">{label}</p>
}

function PlaceRow({ place, onResolve }: { place: ModPlace; onResolve: (id: string) => void }) {
  const { lang } = useLanguage()
  const router = useRouter()
  const tr = (en: string, ar: string, ur: string) => (lang === 'en' ? en : lang === 'ur' ? ur : ar)
  const cat = getCategoryMeta(place.category)
  const [busy, setBusy] = useState(false)

  async function act(path: 'approve' | 'reject', body?: any) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/mod/directory/${place.id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error || 'فشل'); return }
      toast.success(path === 'approve' ? tr('Approved', 'تمت الموافقة', 'منظور') : tr('Rejected', 'تم الرفض', 'مسترد'))
      onResolve(place.id)
      // Refresh the parent /mod page's SSR data so the directory
      // pill badge count decrements and any cached lists reflect
      // the new status without a manual reload.
      router.refresh()
    } finally { setBusy(false) }
  }

  const whatsappHref = buildWhatsAppHref(place.whatsapp)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-3.5 space-y-3">
      {/* Title row */}
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{cat.emoji}</span>
        <div className="flex-1 min-w-0">
          <Link href={`/directory/${place.id}`} className="text-sm font-bold text-gray-900 dark:text-white hover:underline">
            {place.name}
          </Link>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {lang === 'en' ? cat.labelEn : cat.labelAr}
          </p>
          {place.createdByUser && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              {tr('Submitted by', 'أضاف:', 'بھیجنے والا:')} {place.createdByUser.name ?? '—'}
            </p>
          )}
        </div>
      </div>

      {/* Full description — no slicing. Mods need to read everything
          the user wrote to decide on approval. */}
      {place.description && (
        <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed border-s-2 border-gray-200 dark:border-gray-700 ps-2.5">
          {place.description}
        </p>
      )}

      {/* Submitted fields — every one the user provided, so the
          mod can verify and contact-spot-check before approval.
          Hidden rows just don't render to keep the row compact. */}
      <div className="space-y-1 text-[12px]">
        {place.addressText && (
          <DetailLine icon="📍" label={tr('Address', 'العنوان', 'پتہ')} value={place.addressText} />
        )}
        {place.openingHours && (
          <DetailLine icon="🕒" label={tr('Hours', 'الدوام', 'اوقات')} value={place.openingHours} />
        )}
        {place.phone && (
          <DetailLine
            icon="📞"
            label={tr('Phone', 'الجوال', 'فون')}
            value={place.phone}
            href={`tel:${place.phone}`}
          />
        )}
        {place.whatsapp && (
          <DetailLine
            icon="💬"
            label={tr('WhatsApp', 'واتساب', 'واٹس ایپ')}
            value={place.whatsapp}
            href={whatsappHref ?? undefined}
            external
          />
        )}
        {place.website && (
          <DetailLine
            icon="🌐"
            label={tr('Website', 'الموقع', 'ویب سائٹ')}
            value={place.website}
            href={place.website}
            external
            truncate
          />
        )}
        {place.instagram && (
          <DetailLine
            icon="📷"
            label="Instagram"
            value={place.instagram}
            truncate
          />
        )}
        {(place.mapUrl || (place.latitude && place.longitude)) && (
          <DetailLine
            icon="🗺️"
            label={tr('Map', 'الخريطة', 'نقشہ')}
            value={place.mapUrl || `${place.latitude}, ${place.longitude}`}
            href={place.mapUrl || `https://maps.google.com/?q=${place.latitude},${place.longitude}`}
            external
            truncate
          />
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => act('approve', { confidence: 'verified' })}
          disabled={busy}
          className="flex-1 py-2 rounded-xl bg-primary-600 text-white text-xs font-semibold disabled:opacity-50"
        >
          {tr('Approve', 'موافقة', 'منظور')}
        </button>
        <button
          onClick={() => act('approve', { confidence: 'unverified' })}
          disabled={busy}
          className="flex-1 py-2 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs font-semibold disabled:opacity-50"
        >
          {tr('Publish unverified', 'نشر غير مؤكد', 'غیر تصدیق شدہ شائع')}
        </button>
        <button
          onClick={() => {
            const reason = prompt(tr('Reason for rejection?', 'سبب الرفض؟', 'مسترد کرنے کی وجہ؟'))
            if (reason && reason.trim().length >= 3) act('reject', { reason: reason.trim() })
          }}
          disabled={busy}
          className="px-3 py-2 rounded-xl bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs font-semibold disabled:opacity-50"
        >
          {tr('Reject', 'رفض', 'مسترد')}
        </button>
      </div>
    </div>
  )
}

/** Tiny row for a single submitted-field in the mod review card.
 *  Optional href makes it tappable (call / wa / map). truncate=true
 *  caps long URLs so they don't blow out the row. */
function DetailLine({
  icon,
  label,
  value,
  href,
  external = false,
  truncate = false,
}: {
  icon: string
  label: string
  value: string
  href?: string
  external?: boolean
  truncate?: boolean
}) {
  const content = (
    <span className={`text-gray-700 dark:text-gray-300 ${truncate ? 'truncate' : ''}`} dir={external ? 'ltr' : undefined}>
      {value}
    </span>
  )
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs flex-shrink-0" aria-hidden>{icon}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 flex-shrink-0">
        {label}
      </span>
      <span className={`flex-1 min-w-0 ${truncate ? 'truncate' : ''}`}>
        {href ? (
          <a
            href={href}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
            className="text-primary-600 dark:text-primary-400 hover:underline"
          >
            {content}
          </a>
        ) : (
          content
        )}
      </span>
    </div>
  )
}

function ClaimRow({ claim, onResolve }: { claim: PendingClaim; onResolve: (id: string) => void }) {
  const { lang } = useLanguage()
  const router = useRouter()
  const tr = (en: string, ar: string, ur: string) => (lang === 'en' ? en : lang === 'ur' ? ur : ar)
  const cat = getCategoryMeta(claim.place.category)
  const [busy, setBusy] = useState(false)

  async function act(path: 'approve' | 'reject', body?: any) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/mod/directory/claims/${claim.id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error || 'فشل'); return }
      toast.success(path === 'approve' ? tr('Approved', 'تمت الموافقة', 'منظور') : tr('Rejected', 'تم الرفض', 'مسترد'))
      onResolve(claim.id)
      // Same as PlaceRow — bounce the parent /mod page's SSR data
      // so the directory pill badge count stays accurate.
      router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-3.5 space-y-2">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{cat.emoji}</span>
        <div className="flex-1 min-w-0">
          <Link href={`/directory/${claim.place.id}`} className="text-sm font-bold text-gray-900 dark:text-white hover:underline">
            {claim.place.name}
          </Link>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {tr('Requester:', 'مقدم الطلب:', 'درخواست گزار:')} {claim.user.name ?? '—'}
            {claim.user.providerStatus !== 'NONE' ? ` · ${claim.user.providerStatus}` : ''}
            {' · '}
            {tr('rep', 'سمعة', 'ساکھ')} {claim.user.reputation}
          </p>
        </div>
      </div>
      {claim.message && (
        <div className="rounded-xl bg-gray-50 dark:bg-gray-900/40 p-2.5 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-line">
          {claim.message}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={() => act('approve')} disabled={busy} className="flex-1 py-2 rounded-xl bg-primary-600 text-white text-xs font-semibold disabled:opacity-50">
          {tr('Approve claim', 'موافقة', 'منظور')}
        </button>
        <button
          onClick={() => {
            const reason = prompt(tr('Reason for rejection?', 'سبب الرفض؟', 'مسترد کرنے کی وجہ؟'))
            if (reason && reason.trim().length >= 3) act('reject', { reason: reason.trim() })
          }}
          disabled={busy}
          className="px-3 py-2 rounded-xl bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs font-semibold disabled:opacity-50"
        >
          {tr('Reject', 'رفض', 'مسترد')}
        </button>
      </div>
    </div>
  )
}

function ReportRow({ report }: { report: RecentReport }) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) => (lang === 'en' ? en : lang === 'ur' ? ur : ar)
  const cat = getCategoryMeta(report.place.category)
  const TYPE_LABELS: Record<PlaceReportType, [ar: string, en: string]> = {
    WRONG_INFO:     ['معلومة خاطئة', 'Wrong info'],
    CLOSED:         ['المكان مغلق', 'Closed'],
    DUPLICATE:      ['مكرر', 'Duplicate'],
    WRONG_LOCATION: ['موقع خاطئ', 'Wrong location'],
    WRONG_PHONE:    ['رقم خاطئ', 'Wrong phone'],
    SPAM:           ['إعلان/سبام', 'Spam'],
    OTHER:          ['أخرى', 'Other'],
  }
  const [ar, en] = TYPE_LABELS[report.type]

  return (
    <Link
      href={`/directory/${report.place.id}`}
      className="block bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-3.5 space-y-1"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{cat.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{report.place.name}</p>
          <p className="text-xs text-rose-600 dark:text-rose-400">{lang === 'en' ? en : ar}</p>
          {report.message && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{report.message}</p>}
          <p className="text-[10px] text-gray-400 mt-1">
            {tr('Reported by', 'بلّغ:', 'شکایت کنندہ:')} {report.reporter.name ?? '—'}
          </p>
        </div>
      </div>
    </Link>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { PlaceCategory, PlaceReportType } from '@prisma/client'
import { useLanguage } from '@/hooks/useLanguage'
import { getCategoryMeta } from '@/lib/places/categories'
import type { ModPlace } from '@/lib/places/serialize'
import DirectoryHeader from '@/components/places/DirectoryHeader'
import { buildWhatsAppHref } from '@/lib/phone'
import { usePrompt } from '@/components/ConfirmProvider'

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

interface ReviewReportGroup {
  review: {
    id: string
    rating: number
    bodyExcerpt: string | null
    createdAt: string
    reportCount: number
    author: { id: string; name: string | null; avatarUrl: string | null; providerStatus: string }
    place: { id: string; name: string; category: PlaceCategory; status: string }
  }
  reporterCount: number
  reports: {
    id: string
    reason: string
    details: string | null
    createdAt: string
    reporter: { id: string; name: string | null; avatarUrl: string | null }
  }[]
  reasonsSummary: { reason: string; count: number }[]
  firstReportAt: string
  latestReportAt: string
  currentUserHasReported: boolean
}

interface Props {
  data: {
    pendingPlaces: ModPlace[]
    pendingClaims: PendingClaim[]
    recentReports: RecentReport[]
    reviewReportGroups: ReviewReportGroup[]
  }
}

type Tab = 'places' | 'claims' | 'reports' | 'review-reports'

export default function ModDirectoryClient({ data }: Props) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  const [tab, setTab] = useState<Tab>('places')
  const [pendingPlaces, setPendingPlaces] = useState(data.pendingPlaces)
  const [pendingClaims, setPendingClaims] = useState(data.pendingClaims)
  const [reviewReportGroups, setReviewReportGroups] = useState(data.reviewReportGroups)

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
          <TabBtn active={tab === 'review-reports'} onClick={() => setTab('review-reports')} label={tr('Review reports', 'بلاغات التقييمات', 'جائزہ شکایات')} count={reviewReportGroups.length} />
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

        {tab === 'review-reports' && (
          <ReviewReportsTab
            groups={reviewReportGroups}
            onResolve={(reviewId) =>
              setReviewReportGroups((prev) => prev.filter((g) => g.review.id !== reviewId))
            }
            onRefresh={(next) => setReviewReportGroups(next)}
          />
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

const REASON_LABELS: Record<string, [ar: string, en: string]> = {
  WRONG_CATEGORY:  ['تصنيف خاطئ', 'Wrong category'],
  SPAM:            ['إعلان/سبام', 'Spam'],
  INAPPROPRIATE:   ['محتوى غير لائق', 'Inappropriate'],
  SCAM:            ['احتيال', 'Scam'],
  NOT_NEIGHBORHOOD:['ليس من الحي', 'Not from neighborhood'],
  OFFENSIVE:       ['مسيء', 'Offensive'],
  OTHER:           ['أخرى', 'Other'],
}

/**
 * "بلاغات التقييمات" tab. On mount, re-fetches the grouped pending
 * report list so the SSR snapshot stays fresh after the user
 * switches tabs back. Each card lets a mod hide the review or
 * bulk-dismiss all pending reports against it.
 */
function ReviewReportsTab({
  groups,
  onResolve,
  onRefresh,
}: {
  groups: ReviewReportGroup[]
  onResolve: (reviewId: string) => void
  onRefresh: (next: ReviewReportGroup[]) => void
}) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  // Refetch the queue on mount so a mod who tabs away + back doesn't
  // act on stale rows. SSR seeds the first paint; this just keeps
  // it honest.
  useEffect(() => {
    let cancelled = false
    fetch('/api/mod/directory/reviews/reports', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        if (d && Array.isArray(d.groups)) onRefresh(d.groups as ReviewReportGroup[])
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (groups.length === 0) {
    return <Empty label={tr('No review reports.', 'لا توجد بلاغات تقييمات.', 'کوئی جائزہ شکایت نہیں۔')} />
  }
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <ReviewReportRow key={g.review.id} group={g} onResolve={onResolve} />
      ))}
    </div>
  )
}

function ReviewReportRow({
  group,
  onResolve,
}: {
  group: ReviewReportGroup
  onResolve: (reviewId: string) => void
}) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) => (lang === 'en' ? en : lang === 'ur' ? ur : ar)
  const cat = getCategoryMeta(group.review.place.category)
  const prompt = usePrompt()
  const [busy, setBusy] = useState(false)

  async function act(kind: 'hide' | 'dismiss') {
    if (busy) return
    const reason = await prompt({
      title:
        kind === 'hide'
          ? tr('Hide review', 'إخفاء التقييم', 'جائزہ چھپائیں')
          : tr('Dismiss reports', 'تجاهل البلاغات', 'شکایات مسترد کریں'),
      message:
        kind === 'hide'
          ? tr(
              'Reason for hiding this review (3–300 chars). Reviewer will be notified.',
              'سبب الإخفاء (٣–٣٠٠ حرف). سيتم إخطار صاحب التقييم.',
              'چھپانے کی وجہ (3-300 حروف). جائزہ نگار کو اطلاع دی جائے گی۔',
            )
          : tr(
              'Why dismiss all reports on this review? (3–300 chars)',
              'سبب رفض البلاغات على هذا التقييم؟ (٣–٣٠٠ حرف)',
              'اس جائزے کی شکایات کیوں مسترد ہوں؟ (3-300 حروف)',
            ),
      placeholder: tr('Reason', 'السبب', 'وجہ'),
      multiline: true,
      confirmText:
        kind === 'hide'
          ? tr('Hide review', 'إخفاء', 'چھپائیں')
          : tr('Dismiss all', 'تجاهل الكل', 'سب مسترد کریں'),
    })
    if (!reason || reason.trim().length < 3 || reason.trim().length > 300) return
    setBusy(true)
    try {
      const url =
        kind === 'hide'
          ? `/api/mod/directory/reviews/${group.review.id}/hide`
          : `/api/mod/directory/reviews/${group.review.id}/reports/dismiss`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error || 'فشل'); return }
      toast.success(
        kind === 'hide'
          ? tr('Review hidden', 'تم إخفاء التقييم', 'جائزہ چھپا دیا')
          : tr('Reports dismissed', 'تم تجاهل البلاغات', 'شکایات مسترد ہوئیں'),
      )
      onResolve(group.review.id)
    } finally { setBusy(false) }
  }

  const stars = '★'.repeat(group.review.rating) + '☆'.repeat(5 - group.review.rating)
  const placeIsHidden = group.review.place.status !== 'APPROVED'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-3.5 space-y-3">
      {/* Place + rating header */}
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{cat.emoji}</span>
        <div className="flex-1 min-w-0">
          <Link
            href={`/directory/${group.review.place.id}`}
            className="text-sm font-bold text-gray-900 dark:text-white hover:underline"
          >
            {group.review.place.name}
          </Link>
          <p className="text-xs text-amber-500" aria-label={`${group.review.rating} / 5`}>
            {stars}
            <span className="ms-1 text-gray-500 dark:text-gray-400">
              {group.review.rating} / 5
            </span>
          </p>
          {placeIsHidden && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              {tr('Place not approved', 'المكان غير موافق عليه', 'جگہ منظور نہیں')}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
            {group.reporterCount}{' '}
            {group.reporterCount === 1
              ? tr('report', 'بلاغ', 'شکایت')
              : tr('reports', 'بلاغات', 'شکایات')}
          </span>
          {group.currentUserHasReported && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
              {tr('You reported', 'بلّغت', 'آپ نے رپورٹ کی')}
            </span>
          )}
        </div>
      </div>

      {/* Review body excerpt */}
      {group.review.bodyExcerpt && (
        <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed border-s-2 border-gray-200 dark:border-gray-700 ps-2.5">
          {group.review.bodyExcerpt}
        </p>
      )}

      {/* Author + reasons summary */}
      <div className="text-[11px] text-gray-500 dark:text-gray-400 space-y-1">
        <p>
          {tr('Reviewer:', 'صاحب التقييم:', 'جائزہ نگار:')} {group.review.author.name ?? '—'}
        </p>
        <div className="flex flex-wrap gap-1">
          {group.reasonsSummary.map((r) => {
            const [ar, en] = REASON_LABELS[r.reason] ?? [r.reason, r.reason]
            return (
              <span
                key={r.reason}
                className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-900/40 text-[10px] font-semibold text-gray-700 dark:text-gray-300"
              >
                {lang === 'en' ? en : ar}
                {r.count > 1 ? ` ×${r.count}` : ''}
              </span>
            )
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => act('hide')}
          disabled={busy}
          className="flex-1 py-2 rounded-xl bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs font-semibold disabled:opacity-50"
        >
          {tr('Hide review', 'إخفاء التقييم', 'جائزہ چھپائیں')}
        </button>
        <button
          type="button"
          onClick={() => act('dismiss')}
          disabled={busy}
          className="flex-1 py-2 rounded-xl bg-gray-100 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300 text-xs font-semibold disabled:opacity-50"
        >
          {tr('Dismiss all', 'تجاهل الكل', 'سب مسترد')}
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

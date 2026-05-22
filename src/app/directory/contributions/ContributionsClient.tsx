'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/hooks/useLanguage'
import DirectoryHeader from '@/components/places/DirectoryHeader'
import HaiLoader from '@/components/HaiLoader'
import {
  statusBadge, matchesFilter,
  type ContribType, type ContribStatus, type ContribFilter, type ChangedField,
} from '@/lib/directory/contributions'

interface Contribution {
  id: string
  type: ContribType
  status: ContribStatus
  placeName: string | null
  neighborhoodName: string | null
  points: number
  reviewNote: string | null
  changedFields: ChangedField[]
  createdAt: string
  reviewedAt: string | null
}
interface Summary {
  reputation: number
  socialPoints: number
  directoryContributionPoints: number
  directoryReportPoints: number
  pending: number; approved: number; rejected: number; total: number
}
interface Payload { summary: Summary; dailyCap: { earnedToday: number; cap: number }; contributions: Contribution[] }
const EMPTY_SUMMARY: Summary = { reputation: 0, socialPoints: 0, directoryContributionPoints: 0, directoryReportPoints: 0, pending: 0, approved: 0, rejected: 0, total: 0 }

const TYPE_LABEL: Record<ContribType, { ar: string; en: string }> = {
  CREATE_PLACE:     { ar: 'إضافة مكان',            en: 'New place' },
  EDIT_PLACE:       { ar: 'تصحيح معلومات',          en: 'Edit info' },
  ADD_CONTACT:      { ar: 'إضافة/تصحيح رقم تواصل',  en: 'Contact fix' },
  FIX_LOCATION:     { ar: 'تصحيح موقع',             en: 'Location fix' },
  ADD_PHOTO:        { ar: 'إضافة صورة',             en: 'Photo' },
  REPORT_DUPLICATE: { ar: 'بلاغ مكان مكرر',         en: 'Duplicate report' },
  REPORT_CLOSED:    { ar: 'بلاغ مكان مغلق',         en: 'Closed report' },
}
const BADGE: Record<ReturnType<typeof statusBadge>, { ar: string; en: string; cls: string }> = {
  pending:   { ar: 'قيد المراجعة',   en: 'Pending',  cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  approved:  { ar: 'مقبول',          en: 'Approved', cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
  actioned:  { ar: 'تم اتخاذ إجراء',  en: 'Actioned', cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
  rejected:  { ar: 'مرفوض',          en: 'Rejected', cls: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
  duplicate: { ar: 'مكرر',           en: 'Duplicate',cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' },
}
const FIELD_LABEL: Record<string, { ar: string; en: string }> = {
  name: { ar: 'الاسم', en: 'Name' }, category: { ar: 'التصنيف', en: 'Category' }, description: { ar: 'الوصف', en: 'Description' },
  addressText: { ar: 'العنوان', en: 'Address' }, phone: { ar: 'الهاتف', en: 'Phone' }, whatsapp: { ar: 'واتساب', en: 'WhatsApp' },
  website: { ar: 'الموقع', en: 'Website' }, instagram: { ar: 'انستغرام', en: 'Instagram' },
  latitude: { ar: 'خط العرض', en: 'Lat' }, longitude: { ar: 'خط الطول', en: 'Lng' },
}
const FILTERS: { key: ContribFilter; ar: string; en: string }[] = [
  { key: 'all', ar: 'الكل', en: 'All' },
  { key: 'pending', ar: 'قيد المراجعة', en: 'Pending' },
  { key: 'approved', ar: 'المقبولة', en: 'Approved' },
  { key: 'rejected', ar: 'المرفوضة', en: 'Rejected' },
  { key: 'places', ar: 'إضافات الأماكن', en: 'Places' },
  { key: 'corrections', ar: 'التصحيحات', en: 'Corrections' },
  { key: 'reports', ar: 'البلاغات', en: 'Reports' },
]

export default function ContributionsClient() {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) => (lang === 'en' ? en : lang === 'ur' ? ur : ar)
  const L = (m: { ar: string; en: string }) => (lang === 'en' ? m.en : m.ar)
  const [data, setData] = useState<Payload | null>(null)
  const [filter, setFilter] = useState<ContribFilter>('all')

  useEffect(() => {
    fetch('/api/directory/contributions')
      .then((r) => r.json())
      .then((d) => setData(d && d.summary ? d : { summary: EMPTY_SUMMARY, dailyCap: { earnedToday: 0, cap: 15 }, contributions: [] }))
      .catch(() => setData({ summary: EMPTY_SUMMARY, dailyCap: { earnedToday: 0, cap: 15 }, contributions: [] }))
  }, [])

  const visible = useMemo(
    () => (data?.contributions ?? []).filter((c) => matchesFilter(c, filter)),
    [data, filter],
  )
  const dateFmt = (iso: string) => new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'ar-SA', { month: 'short', day: 'numeric' })

  return (
    <main className="hai-directory-screen min-h-screen bg-gray-50 dark:bg-[#19232a]">
      <DirectoryHeader title={tr('My contributions', 'مساهماتي', 'میری شراکتیں')} backHref="/directory" />
      <div className="max-w-[640px] mx-auto px-4 pt-4 space-y-3" style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 2rem)' }}>
        {data === null ? (
          <div className="py-10"><HaiLoader size="md" /></div>
        ) : data.summary.total === 0 ? (
          <div className="text-center py-14">
            <p className="text-5xl mb-3">📝</p>
            <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">{tr('You haven’t contributed to the directory yet.', 'لم تبدأ بالمساهمة في دليل الحي بعد.', 'ابھی کوئی شراکت نہیں۔')}</p>
            <div className="flex items-center justify-center gap-2">
              <Link href="/directory/new" className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold active:scale-95">{tr('Add a place', 'أضف مكانًا', 'جگہ شامل کریں')}</Link>
              <Link href="/directory" className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-semibold active:scale-95">{tr('Explore directory', 'استكشف دليل الحي', 'دریافت کریں')}</Link>
            </div>
          </div>
        ) : (
          <>
            {/* Summary header — ONE visible reputation with a breakdown
                that explains where it came from (not separate scores). */}
            <div className="rounded-2xl bg-gradient-to-br from-primary-600 to-primary-700 text-white p-4 shadow-lg shadow-primary-600/20">
              <p className="text-xs text-primary-100">{tr('Reputation', 'السمعة', 'ساکھ')}</p>
              <p className="text-3xl font-bold mt-0.5">{data.summary.reputation} <span className="text-base">⭐</span></p>
              <div className="mt-2.5 space-y-0.5 text-[11px] text-primary-50">
                <p>{tr('From posts & activity', 'من المشاركات والتفاعل', '')}: <b>+{data.summary.socialPoints}</b></p>
                <p>{tr('From directory contributions', 'من مساهمات دليل الحي', '')}: <b>+{data.summary.directoryContributionPoints}</b></p>
                <p>{tr('From valid reports', 'من البلاغات الصحيحة', '')}: <b>+{data.summary.directoryReportPoints}</b></p>
              </div>
              <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-white/15 text-[12px]">
                <span>{tr('Pending', 'قيد المراجعة', 'زیر التواء')}: <b>{data.summary.pending}</b></span>
                <span>{tr('Approved', 'مقبول', 'منظور')}: <b>{data.summary.approved}</b></span>
                <span>{tr('Rejected', 'مرفوض', 'مسترد')}: <b>{data.summary.rejected}</b></span>
              </div>
              <p className="text-[11px] text-primary-100 mt-2">
                {tr(
                  `Earned ${data.dailyCap.earnedToday} of ${data.dailyCap.cap} reputation available today`,
                  `حصلت اليوم على ${data.dailyCap.earnedToday} من ${data.dailyCap.cap} نقطة متاحة`,
                  `آج ${data.dailyCap.earnedToday}/${data.dailyCap.cap}`,
                )}
              </p>
            </div>

            {/* Filters */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${filter === f.key ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
                >
                  {L(f)}
                </button>
              ))}
            </div>

            {/* Cards */}
            {visible.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 text-sm py-10">
                {filter === 'pending'
                  ? tr('No contributions under review.', 'لا توجد مساهمات قيد المراجعة.', 'کوئی نہیں')
                  : tr('Nothing here.', 'لا يوجد شيء هنا.', 'کوئی نہیں')}
              </p>
            ) : (
              visible.map((c) => {
                const badge = BADGE[statusBadge(c.type, c.status)]
                return (
                  <div key={c.id} className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] font-bold text-gray-900 dark:text-white truncate">{c.placeName || L(TYPE_LABEL[c.type])}</span>
                      <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0 ${badge.cls}`}>{L(badge)}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {L(TYPE_LABEL[c.type])}
                      {c.neighborhoodName ? ` · ${c.neighborhoodName}` : ''}
                      {` · ${dateFmt(c.createdAt)}`}
                      {c.reviewedAt ? ` · ${tr('reviewed', 'روجع', '')} ${dateFmt(c.reviewedAt)}` : ''}
                    </p>

                    {/* Changed-field summary (suggestions) */}
                    {c.changedFields.length > 0 && (
                      <div className="space-y-0.5 pt-0.5">
                        {c.changedFields.map((f, i) => (
                          <p key={i} className="text-[12px]">
                            <span className="text-gray-500 dark:text-gray-400">{L(FIELD_LABEL[f.key] ?? { ar: f.key, en: f.key })}: </span>
                            {f.oldValue && <span className="text-gray-400 line-through">{f.oldValue} </span>}
                            <span className="text-gray-700 dark:text-gray-200 font-medium">{f.suggestedValue}</span>
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Points / status line */}
                    {c.points > 0 ? (
                      <p className="text-[12px] font-bold text-emerald-600 dark:text-emerald-400">{tr(`+${c.points} reputation added`, `تم منحك +${c.points} سمعة`, `+${c.points}`)}</p>
                    ) : (c.status === 'PENDING_REVIEW' || c.status === 'NEEDS_EDIT') ? (
                      <p className="text-[11px] text-gray-400">{tr('No reputation yet', 'لم تحصل على نقاط بعد', 'ابھی نہیں')}</p>
                    ) : null}

                    {/* Safe rejection reason */}
                    {c.reviewNote && (
                      <p className="text-[12px] text-red-600 dark:text-red-400">{tr('Reason', 'السبب', 'وجہ')}: {c.reviewNote}</p>
                    )}
                  </div>
                )
              })
            )}
          </>
        )}
      </div>
    </main>
  )
}

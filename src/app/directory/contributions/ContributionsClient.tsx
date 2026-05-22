'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import DirectoryHeader from '@/components/places/DirectoryHeader'
import HaiLoader from '@/components/HaiLoader'

interface Contribution {
  id: string
  type: string
  status: string
  placeName: string | null
  potentialDuplicate: boolean
  reviewNote: string | null
  points: number
  createdAt: string
}

const TYPE_LABEL: Record<string, { ar: string; en: string }> = {
  CREATE_PLACE:     { ar: 'إضافة مكان',      en: 'New place' },
  EDIT_PLACE:       { ar: 'تعديل مكان',      en: 'Edit' },
  ADD_PHOTO:        { ar: 'إضافة صورة',      en: 'Photo' },
  FIX_LOCATION:     { ar: 'تصحيح موقع',      en: 'Location fix' },
  ADD_CONTACT:      { ar: 'معلومات تواصل',   en: 'Contact info' },
  REPORT_DUPLICATE: { ar: 'بلاغ تكرار',      en: 'Duplicate report' },
  REPORT_CLOSED:    { ar: 'بلاغ إغلاق',      en: 'Closed report' },
}
const STATUS_META: Record<string, { ar: string; en: string; cls: string }> = {
  PENDING_REVIEW: { ar: 'قيد المراجعة', en: 'Pending review', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  APPROVED:       { ar: 'مقبول',        en: 'Approved',       cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
  NEEDS_EDIT:     { ar: 'بحاجة تعديل',  en: 'Needs edit',     cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  REJECTED:       { ar: 'مرفوض',        en: 'Rejected',       cls: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
  DUPLICATE:      { ar: 'مكرر',         en: 'Duplicate',      cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' },
}

export default function ContributionsClient() {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) => (lang === 'en' ? en : lang === 'ur' ? ur : ar)
  const [items, setItems] = useState<Contribution[] | null>(null)

  useEffect(() => {
    fetch('/api/directory/contributions')
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d.contributions) ? d.contributions : []))
      .catch(() => setItems([]))
  }, [])

  const lbl = (m: { ar: string; en: string } | undefined) => (m ? (lang === 'en' ? m.en : m.ar) : '')

  return (
    <main className="hai-directory-screen min-h-screen bg-gray-50 dark:bg-[#19232a]">
      <DirectoryHeader title={tr('My contributions', 'مساهماتي في الدليل', 'میری شراکتیں')} backHref="/directory" />
      <div className="max-w-[640px] mx-auto px-4 pt-4 space-y-2.5" style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 2rem)' }}>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {tr('You earn reputation points only after a moderator approves your contribution.',
              'تحصل على نقاط السمعة فقط بعد موافقة المشرف على مساهمتك.',
              'منظوری کے بعد ہی پوائنٹس ملتے ہیں۔')}
        </p>

        {items === null ? (
          <div className="py-8"><HaiLoader size="md" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-5xl mb-3">📝</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{tr('No contributions yet.', 'لا توجد مساهمات بعد.', 'ابھی کوئی شراکت نہیں۔')}</p>
          </div>
        ) : (
          items.map((c) => {
            const sm = STATUS_META[c.status]
            return (
              <div key={c.id} className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-bold text-gray-900 dark:text-white truncate">
                    {c.placeName || lbl(TYPE_LABEL[c.type])}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {c.status === 'APPROVED' && c.points > 0 && (
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">+{c.points} ⭐</span>
                    )}
                    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${sm?.cls || ''}`}>{lbl(sm)}</span>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {lbl(TYPE_LABEL[c.type])}
                  {c.potentialDuplicate ? ` · ${tr('possible duplicate', 'تكرار محتمل', 'ممکنہ نقل')}` : ''}
                  {` · ${new Date(c.createdAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'ar-SA', { month: 'short', day: 'numeric' })}`}
                </p>
                {c.status === 'REJECTED' && c.reviewNote && (
                  <p className="text-[12px] text-red-600 dark:text-red-400 mt-1.5">{tr('Reason', 'السبب', 'وجہ')}: {c.reviewNote}</p>
                )}
              </div>
            )
          })
        )}
      </div>
    </main>
  )
}

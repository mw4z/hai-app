'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { FiArrowRight } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import HaiLoader from '@/components/HaiLoader'
import { serviceCategoryLabel } from '@/lib/services/serviceCategories'
import { SERVICE_REPORT_REASONS } from '@/lib/services/serviceContactSafety'

type Filter = 'pending' | 'hidden' | 'reported'
type Action = 'approve' | 'hide' | 'remove' | 'dismiss'

interface Row {
  id: string
  displayName: string
  category: string
  description: string | null
  serviceArea: string | null
  status: string
  verification: string
  reportCount: number
  phone: string
  submittedBy: string | null
  reports: { reason: string; message: string | null; createdAt: string }[]
}

const reasonAr = (v: string) => SERVICE_REPORT_REASONS.find((r) => r.value === v)?.ar ?? v

export default function ModServiceContactsClient() {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string) => (lang === 'en' ? en : ar)

  const [filter, setFilter] = useState<Filter>('pending')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback((f: Filter) => {
    setRows(null)
    fetch(`/api/mod/directory/service-contacts?filter=${f}`)
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d.contacts) ? d.contacts : []))
      .catch(() => setRows([]))
  }, [])

  useEffect(() => { load(filter) }, [filter, load])

  async function act(id: string, action: Action) {
    setBusy(id)
    try {
      const res = await fetch(`/api/mod/directory/service-contacts/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error || tr('Failed', 'فشل')); return }
      setRows((cur) => (cur || []).filter((r) => r.id !== id))
      toast.success(tr('Done', 'تم'))
    } catch { toast.error(tr('Connection error', 'خطأ بالاتصال')) }
    finally { setBusy(null) }
  }

  const TABS: { key: Filter; ar: string; en: string }[] = [
    { key: 'pending',  ar: 'بانتظار المراجعة', en: 'Pending' },
    { key: 'hidden',   ar: 'مخفية',            en: 'Hidden' },
    { key: 'reported', ar: 'مُبلَّغ عنها',      en: 'Reported' },
  ]

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-[#19232a]">
      <div className="sticky top-0 z-10 bg-white dark:bg-[#19232a] border-b border-gray-200 dark:border-gray-800" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-[640px] mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/mod/directory" className="text-gray-500 dark:text-gray-400"><FiArrowRight className="w-5 h-5" /></Link>
          <h1 className="text-base font-bold text-gray-900 dark:text-white">{tr('Service contacts', 'خدمات وأرقام')}</h1>
        </div>
      </div>

      <div className="max-w-[640px] mx-auto px-4 py-4 space-y-3" style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 2rem)' }}>
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`flex-1 py-2 rounded-xl text-sm font-bold ${filter === t.key ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
            >
              {lang === 'en' ? t.en : t.ar}
            </button>
          ))}
        </div>

        {rows === null ? (
          <div className="py-6"><HaiLoader size="md" /></div>
        ) : rows.length === 0 ? (
          <p className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">{tr('Nothing here.', 'لا يوجد شيء هنا.')}</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-bold text-gray-900 dark:text-white truncate">{r.displayName}</span>
                <span dir="ltr" className="text-xs text-gray-400">{r.phone}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {serviceCategoryLabel(r.category as any, lang)}
                {r.serviceArea ? ` · ${r.serviceArea}` : ''}
                {r.submittedBy ? ` · ${tr('by', 'بواسطة')} ${r.submittedBy}` : ''}
              </p>
              {r.description && <p className="text-[13px] text-gray-600 dark:text-gray-300">{r.description}</p>}
              {r.verification === 'PENDING_OWNER_CONFIRMATION' && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">{tr('Awaiting owner confirmation — cannot publish here', 'بانتظار تأكيد صاحب الرقم — لا يُنشر من المشرف')}</p>
              )}
              {r.reports.length > 0 && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-2.5 py-1.5 space-y-0.5">
                  <p className="text-[11px] font-semibold text-red-700 dark:text-red-300">{r.reportCount} {tr('reports', 'بلاغ')}</p>
                  {r.reports.slice(0, 3).map((rep, i) => (
                    <p key={i} className="text-[11px] text-red-600 dark:text-red-400">• {reasonAr(rep.reason)}{rep.message ? `: ${rep.message}` : ''}</p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {filter === 'hidden' && (
                  <button onClick={() => act(r.id, 'approve')} disabled={busy === r.id} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50">{tr('Restore', 'استعادة')}</button>
                )}
                {filter === 'reported' && (
                  <>
                    <button onClick={() => act(r.id, 'dismiss')} disabled={busy === r.id} className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-semibold disabled:opacity-50">{tr('Dismiss reports', 'تجاهل البلاغات')}</button>
                    <button onClick={() => act(r.id, 'hide')} disabled={busy === r.id} className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold disabled:opacity-50">{tr('Hide', 'إخفاء')}</button>
                  </>
                )}
                <button onClick={() => act(r.id, 'remove')} disabled={busy === r.id} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold disabled:opacity-50">{tr('Remove', 'حذف')}</button>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  )
}

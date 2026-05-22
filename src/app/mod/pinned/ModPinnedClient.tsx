'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { FiArrowRight } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { useConfirm, usePrompt } from '@/components/ConfirmProvider'
import HaiLoader from '@/components/HaiLoader'

interface Item {
  id: string; type: string; sourceType: string | null; sourceId: string | null
  title: string; summary: string | null; fileUrl: string | null; linkUrl: string | null
  status: string; priority: number; pinnedAt: string; expiresAt: string | null
  hiddenReason: string | null; pinnedBy: string | null
}

const TYPES = ['MANUAL_NOTE', 'FILE', 'LINK', 'POST', 'COMMENT', 'MESSAGE']
const TYPE_LABEL: Record<string, { ar: string; en: string }> = {
  MANUAL_NOTE: { ar: 'ملاحظة', en: 'Note' }, FILE: { ar: 'ملف', en: 'File' }, LINK: { ar: 'رابط', en: 'Link' },
  POST: { ar: 'منشور', en: 'Post' }, COMMENT: { ar: 'تعليق', en: 'Comment' }, MESSAGE: { ar: 'رسالة', en: 'Message' },
}
const STATUS_CLS: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  HIDDEN: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  EXPIRED: 'bg-gray-100 dark:bg-gray-800 text-gray-500',
  REMOVED: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
}
const DURATIONS = [
  { key: '24h', ar: '24 ساعة', en: '24h' }, { key: '7d', ar: '7 أيام', en: '7d' },
  { key: '30d', ar: '30 يوم', en: '30d' }, { key: 'forever', ar: 'دائم', en: 'Forever' },
]

export default function ModPinnedClient({ neighborhoodId, neighborhoodName }: { neighborhoodId: string; neighborhoodName: string }) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string) => (lang === 'en' ? en : ar)
  const confirmDialog = useConfirm()
  const promptDialog = usePrompt()
  const base = `/api/mod/neighborhoods/${neighborhoodId}/pinned-items`

  const [items, setItems] = useState<Item[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [f, setF] = useState({ type: 'MANUAL_NOTE', title: '', summary: '', fileUrl: '', linkUrl: '', sourceType: '', sourceId: '', duration: 'forever' })

  const load = useCallback(() => {
    setItems(null)
    fetch(base, { cache: 'no-store' }).then((r) => r.json()).then((d) => setItems(Array.isArray(d.items) ? d.items : [])).catch(() => setItems([]))
  }, [base])
  useEffect(() => { load() }, [load])

  const input = 'w-full px-3 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

  async function create() {
    if (busy) return
    if (f.title.trim().length < 2) { toast.error(tr('Enter a title', 'أدخل عنوانًا')); return }
    setBusy('create')
    try {
      const body: any = { type: f.type, title: f.title, summary: f.summary, duration: f.duration }
      if (f.type === 'FILE') body.fileUrl = f.fileUrl
      if (f.type === 'LINK') body.linkUrl = f.linkUrl
      if (['POST', 'COMMENT', 'MESSAGE'].includes(f.type)) { body.sourceType = f.type.toLowerCase(); body.sourceId = f.sourceId }
      const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || tr('Failed', 'فشل')); return }
      toast.success(d.deduped ? tr('Updated existing pin', 'تم تحديث التثبيت') : tr('Pinned', 'تم التثبيت'))
      setShowForm(false); setF({ type: 'MANUAL_NOTE', title: '', summary: '', fileUrl: '', linkUrl: '', sourceType: '', sourceId: '', duration: 'forever' })
      load()
    } catch { toast.error(tr('Connection error', 'خطأ بالاتصال')) } finally { setBusy(null) }
  }

  async function act(id: string, kind: 'hide' | 'unhide' | 'remove' | 'edit') {
    if (busy) return
    if (kind === 'hide') {
      const r = await promptDialog({ title: tr('Hide', 'إخفاء'), message: tr('Reason for hiding?', 'سبب الإخفاء؟') })
      if (r === null) return
      setBusy(id)
      const res = await fetch(`${base}/${id}/hide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: r }) })
      finishAct(res); return
    }
    if (kind === 'unhide') { setBusy(id); finishAct(await fetch(`${base}/${id}/unhide`, { method: 'POST' })); return }
    if (kind === 'remove') {
      const ok = await confirmDialog({ title: tr('Remove pin', 'حذف التثبيت'), message: tr('Remove from residents? The original content is not deleted.', 'إزالته من السكان؟ المحتوى الأصلي لن يُحذف.'), confirmText: tr('Remove', 'حذف') })
      if (!ok) return
      setBusy(id); finishAct(await fetch(`${base}/${id}`, { method: 'DELETE' })); return
    }
    if (kind === 'edit') {
      const t = await promptDialog({ title: tr('Edit title', 'تعديل العنوان'), message: tr('New title', 'العنوان الجديد') })
      if (t === null || t.trim().length < 2) return
      setBusy(id); finishAct(await fetch(`${base}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t }) }))
    }
  }
  async function finishAct(res: Response) {
    try { if (res.ok) { toast.success(tr('Done', 'تم')); load() } else { const d = await res.json().catch(() => ({})); toast.error(d.error || tr('Failed', 'فشل')) } }
    finally { setBusy(null) }
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'ar-SA', { month: 'short', day: 'numeric' })

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-[#19232a]">
      <div className="sticky top-0 z-10 bg-white dark:bg-[#19232a] border-b border-gray-200 dark:border-gray-800" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-[640px] mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/mod" className="text-gray-500 dark:text-gray-400"><FiArrowRight className="w-5 h-5" /></Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-gray-900 dark:text-white">{tr('Pinned items', 'الأبرز والمثبتات')}</h1>
            {neighborhoodName && <p className="text-[11px] text-gray-400 truncate">{neighborhoodName}</p>}
          </div>
          <button onClick={() => setShowForm((v) => !v)} className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-bold">{showForm ? tr('Cancel', 'إلغاء') : tr('+ Pin', '+ تثبيت')}</button>
        </div>
      </div>

      <div className="max-w-[640px] mx-auto px-4 py-4 space-y-3" style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 2rem)' }}>
        {showForm && (
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3.5 space-y-2.5">
            <select value={f.type} onChange={(e) => setF((p) => ({ ...p, type: e.target.value }))} className={input}>
              {TYPES.map((t) => <option key={t} value={t}>{lang === 'en' ? TYPE_LABEL[t].en : TYPE_LABEL[t].ar}</option>)}
            </select>
            <input value={f.title} onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} placeholder={tr('Title (required)', 'العنوان (مطلوب)')} className={input} />
            <textarea value={f.summary} onChange={(e) => setF((p) => ({ ...p, summary: e.target.value }))} rows={2} placeholder={tr('Summary (optional)', 'ملخص (اختياري)')} className={`${input} resize-none`} />
            {f.type === 'FILE' && <input value={f.fileUrl} onChange={(e) => setF((p) => ({ ...p, fileUrl: e.target.value }))} dir="ltr" placeholder={tr('File URL', 'رابط الملف')} className={input} />}
            {f.type === 'LINK' && <input value={f.linkUrl} onChange={(e) => setF((p) => ({ ...p, linkUrl: e.target.value }))} dir="ltr" placeholder={tr('Link URL', 'الرابط')} className={input} />}
            {['POST', 'COMMENT', 'MESSAGE'].includes(f.type) && <input value={f.sourceId} onChange={(e) => setF((p) => ({ ...p, sourceId: e.target.value }))} dir="ltr" placeholder={tr('Source ID', 'معرّف المصدر')} className={input} />}
            <div className="flex gap-2">
              {DURATIONS.map((d) => (
                <button key={d.key} type="button" onClick={() => setF((p) => ({ ...p, duration: d.key }))} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${f.duration === d.key ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{lang === 'en' ? d.en : d.ar}</button>
              ))}
            </div>
            <button onClick={create} disabled={busy === 'create'} className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-sm font-bold disabled:opacity-50">{tr('Pin', 'تثبيت')}</button>
          </div>
        )}

        {items === null ? (
          <div className="py-8"><HaiLoader size="md" /></div>
        ) : items.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400 text-sm py-10">{tr('No pinned items yet.', 'لا توجد مثبتات بعد.')}</p>
        ) : (
          items.map((it) => (
            <div key={it.id} className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{it.title}</span>
                <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0 ${STATUS_CLS[it.status] || ''}`}>{it.status}</span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {lang === 'en' ? TYPE_LABEL[it.type]?.en : TYPE_LABEL[it.type]?.ar} · 📌 {fmt(it.pinnedAt)}{it.expiresAt ? ` · ⏳ ${fmt(it.expiresAt)}` : ` · ${tr('forever', 'دائم')}`}
              </p>
              {it.summary && <p className="text-[12px] text-gray-600 dark:text-gray-300 line-clamp-2">{it.summary}</p>}
              {it.status === 'HIDDEN' && it.hiddenReason && <p className="text-[11px] text-amber-600 dark:text-amber-400">{tr('Hidden', 'مخفي')}: {it.hiddenReason}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                <button onClick={() => act(it.id, 'edit')} disabled={!!busy} className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-semibold disabled:opacity-50">{tr('Edit', 'تعديل')}</button>
                {it.status === 'HIDDEN'
                  ? <button onClick={() => act(it.id, 'unhide')} disabled={!!busy} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50">{tr('Unhide', 'إظهار')}</button>
                  : it.status === 'ACTIVE' && <button onClick={() => act(it.id, 'hide')} disabled={!!busy} className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold disabled:opacity-50">{tr('Hide', 'إخفاء')}</button>}
                {it.status !== 'REMOVED' && <button onClick={() => act(it.id, 'remove')} disabled={!!busy} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold disabled:opacity-50">{tr('Remove', 'حذف')}</button>}
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  )
}

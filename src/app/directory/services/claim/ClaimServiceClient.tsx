'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import DirectoryHeader from '@/components/places/DirectoryHeader'
import HaiLoader from '@/components/HaiLoader'
import { SERVICE_CATEGORIES } from '@/lib/services/serviceCategories'

interface Claim {
  id: string
  displayName: string
  category: string
  description: string | null
  serviceArea: string | null
  phone: string
  neighborhoodName: string | null
}

/**
 * "هل هذا رقمك؟" — the owner-confirmation surface. Lists service contacts
 * that the system matched to THIS user's phone (still private, pending).
 * Accept activates a public listing with fields the owner chooses; reject
 * removes it. The user's identity is never shown to whoever suggested it.
 */
export default function ClaimServiceClient() {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) => (lang === 'en' ? en : lang === 'ur' ? ur : ar)

  const [claims, setClaims] = useState<Claim[] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [form, setForm] = useState<{ displayName: string; category: string; description: string; serviceArea: string }>({
    displayName: '', category: '', description: '', serviceArea: '',
  })

  useEffect(() => {
    fetch('/api/directory/service-contacts/claims')
      .then((r) => r.json())
      .then((d) => setClaims(Array.isArray(d.claims) ? d.claims : []))
      .catch(() => setClaims([]))
  }, [])

  function startAccept(c: Claim) {
    setEditing(c.id)
    setForm({ displayName: c.displayName, category: c.category, description: c.description || '', serviceArea: c.serviceArea || '' })
  }

  async function send(id: string, action: 'accept' | 'reject') {
    setBusy(id)
    try {
      const res = await fetch(`/api/directory/service-contacts/${id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'accept' ? { action, ...form } : { action }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d?.error || tr('Failed', 'فشل', 'ناکام')); return }
      setClaims((cur) => (cur || []).filter((c) => c.id !== id))
      setEditing(null)
      toast.success(action === 'accept'
        ? tr('Your service page is live', 'تم تفعيل صفحة الخدمة', 'صفحہ فعال ہو گیا')
        : tr('Removed', 'تم الرفض', 'ہٹا دیا گیا'))
    } catch { toast.error(tr('Connection error', 'خطأ بالاتصال', 'کنکشن خرابی')) }
    finally { setBusy(null) }
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[14px] focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <main className="hai-directory-screen min-h-screen bg-gray-50 dark:bg-[#19232a]">
      <DirectoryHeader title={tr('Is this your number?', 'هل هذا رقمك؟', 'کیا یہ آپ کا نمبر ہے؟')} backHref="/directory?tab=services" />
      <div className="max-w-[640px] mx-auto px-4 pt-4 space-y-3" style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 2rem)' }}>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {tr('Someone suggested your number as a local service. Activate a page you control, or remove it.',
              'تم اقتراح رقمك كجهة خدمة في دليل الحي. يمكنك تفعيل صفحة تتحكم بها، أو رفضها.',
              'کسی نے آپ کا نمبر تجویز کیا۔')}
        </p>

        {claims === null ? (
          <div className="py-6"><HaiLoader size="md" /></div>
        ) : claims.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-5xl mb-3">✅</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{tr('No pending requests.', 'لا توجد طلبات معلّقة.', 'کوئی درخواست نہیں۔')}</p>
          </div>
        ) : (
          claims.map((c) => (
            <div key={c.id} className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-bold text-gray-900 dark:text-white truncate">{c.displayName}</span>
                <span dir="ltr" className="text-xs text-gray-400">{c.phone}</span>
              </div>
              {c.neighborhoodName && <p className="text-xs text-gray-500 dark:text-gray-400">{c.neighborhoodName}</p>}

              {editing === c.id ? (
                <div className="space-y-2 pt-1">
                  <input value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} maxLength={80} placeholder={tr('Display name', 'الاسم المعروض', 'نام')} className={inputCls} />
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className={inputCls}>
                    {SERVICE_CATEGORIES.map((s) => (
                      <option key={s.key} value={s.key}>{lang === 'en' ? s.labelEn : lang === 'ur' ? s.labelUr : s.labelAr}</option>
                    ))}
                  </select>
                  <input value={form.serviceArea} onChange={(e) => setForm((f) => ({ ...f, serviceArea: e.target.value }))} maxLength={120} placeholder={tr('Service area (optional)', 'نطاق الخدمة (اختياري)', 'علاقہ')} className={inputCls} />
                  <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} maxLength={280} rows={2} placeholder={tr('Short description (optional)', 'وصف مختصر (اختياري)', 'تفصیل')} className={`${inputCls} resize-none`} />
                  <div className="flex gap-2">
                    <button onClick={() => send(c.id, 'accept')} disabled={busy === c.id} className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-bold disabled:opacity-50 active:scale-[0.97]">
                      {tr('Activate page', 'تفعيل الصفحة', 'فعال کریں')}
                    </button>
                    <button onClick={() => setEditing(null)} className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-semibold">
                      {tr('Cancel', 'إلغاء', 'منسوخ')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => startAccept(c)} disabled={busy === c.id} className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-bold disabled:opacity-50 active:scale-[0.97]">
                    {tr('Yes, activate', 'نعم، فعّل صفحتي', 'ہاں، فعال کریں')}
                  </button>
                  <button onClick={() => send(c.id, 'reject')} disabled={busy === c.id} className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-semibold disabled:opacity-50">
                    {tr('No, remove', 'لا، احذف', 'نہیں، ہٹائیں')}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  )
}

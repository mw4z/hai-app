'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiPhone, FiFlag, FiStar, FiMessageCircle, FiEdit2, FiTrash2 } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { useConfirm } from '@/components/ConfirmProvider'
import { callPhone, openWhatsApp } from '@/lib/openExternal'
import { getServiceCategoryMeta, SERVICE_CATEGORIES } from '@/lib/services/serviceCategories'
import { SERVICE_REPORT_REASONS } from '@/lib/services/serviceContactSafety'
import type { PublicServiceContact } from '@/lib/services/serializeServiceContact'

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
    </svg>
  )
}

const TRUST: Record<PublicServiceContact['trust'], { ar: string; en: string; cls: string }> = {
  VERIFIED_PROVIDER:   { ar: 'مزود خدمة موثق',  en: 'Verified provider', cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
  PENDING_OWNER:       { ar: 'بانتظار تأكيد صاحب الرقم', en: 'Pending owner', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  COMMUNITY_UNVERIFIED:{ ar: 'مضاف من السكان · غير موثق', en: 'Community · unverified', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' },
}

export default function ServiceContactCard({
  contact,
  currentUserId = null,
  canModerate = false,
  onRemoved,
  onUpdated,
}: {
  contact: PublicServiceContact
  currentUserId?: string | null
  canModerate?: boolean
  onRemoved?: (id: string) => void
  onUpdated?: (c: PublicServiceContact) => void
}) {
  const { lang } = useLanguage()
  const router = useRouter()
  const confirmDialog = useConfirm()
  const tr = (en: string, ar: string, ur: string) => (lang === 'en' ? en : lang === 'ur' ? ur : ar)
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  // Edit-form fields
  const [fName, setFName] = useState(contact.displayName)
  const [fDesc, setFDesc] = useState(contact.description || '')
  const [fArea, setFArea] = useState(contact.serviceArea || '')
  const [fCat, setFCat] = useState(contact.category)
  const [fWa, setFWa] = useState(contact.whatsapp)

  const cat = getServiceCategoryMeta(contact.category as any)
  const catLabel = lang === 'en' ? cat.labelEn : lang === 'ur' ? cat.labelUr : cat.labelAr
  const trust = TRUST[contact.trust]
  const canDM = !!contact.messageableUserId && contact.messageableUserId !== currentUserId
  const isOwner = !!contact.messageableUserId && contact.messageableUserId === currentUserId
  const canManage = canModerate || isOwner // mods + the listing's own owner

  async function report(reason: string) {
    setReporting(false)
    try {
      const res = await fetch(`/api/directory/service-contacts/${contact.id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (res.ok) { setReported(true); toast.success(tr('Reported — thanks', 'تم الإبلاغ، شكراً', 'رپورٹ ہو گئی')) }
      else { const d = await res.json().catch(() => ({})); toast.error(d?.error || tr('Failed', 'فشل', 'ناکام')) }
    } catch { toast.error(tr('Connection error', 'خطأ بالاتصال', 'کنکشن خرابی')) }
  }

  async function startDM() {
    if (!contact.messageableUserId) return
    try {
      const res = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: contact.messageableUserId }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.threadId) { router.push(`/threads/${d.threadId}`); return }
      toast.error(d.message || d.error || tr('Could not start chat', 'تعذّر بدء المحادثة', 'چیٹ شروع نہیں ہو سکی'))
    } catch { toast.error(tr('Connection error', 'خطأ بالاتصال', 'کنکشن خرابی')) }
  }

  async function saveEdit() {
    if (fName.trim().length < 2) { toast.error(tr('Name required', 'الاسم مطلوب', 'نام درکار')); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/directory/service-contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: fName.trim(), description: fDesc.trim(), serviceArea: fArea.trim(), category: fCat, whatsapp: fWa }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.contact) {
        onUpdated?.(d.contact)
        setEditing(false)
        toast.success(tr('Saved', 'تم الحفظ', 'محفوظ ہو گیا'))
      } else {
        toast.error(d.error || tr('Failed', 'فشل', 'ناکام'))
      }
    } catch { toast.error(tr('Connection error', 'خطأ بالاتصال', 'کنکشن خرابی')) }
    finally { setBusy(false) }
  }

  async function remove() {
    const ok = await confirmDialog({
      message: tr('Remove this listing?', 'إزالة هذا الإدراج؟', 'یہ فہرست ہٹائیں؟'),
      variant: 'danger',
      confirmText: tr('Remove', 'إزالة', 'ہٹائیں'),
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`/api/directory/service-contacts/${contact.id}`, { method: 'DELETE' })
      if (res.ok) { onRemoved?.(contact.id); toast.success(tr('Removed', 'تمت الإزالة', 'ہٹا دیا')) }
      else { toast.error(tr('Failed', 'فشل', 'ناکام')) }
    } catch { toast.error(tr('Connection error', 'خطأ بالاتصال', 'کنکشن خرابی')) }
    finally { setBusy(false) }
  }

  return (
    <div className="relative rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3.5">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center text-xl" aria-hidden>
          {cat.emoji}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-bold text-gray-900 dark:text-white truncate">{contact.displayName}</h3>
            <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 leading-none ${trust.cls}`}>
              {lang === 'en' ? trust.en : trust.ar}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {cat.emoji} {catLabel}
            {contact.serviceArea ? <span> · {contact.serviceArea}</span> : null}
          </p>
          {contact.description ? (
            <>
              <p className={`text-[13px] text-gray-600 dark:text-gray-300 mt-1 ${descExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                {contact.description}
              </p>
              {contact.description.length > 90 && (
                <button
                  type="button"
                  onClick={() => setDescExpanded((v) => !v)}
                  className="text-[11px] text-primary-600 dark:text-primary-400 font-medium mt-0.5 active:opacity-70"
                >
                  {descExpanded ? tr('Show less', 'عرض أقل', 'کم دکھائیں') : tr('Show more', 'عرض المزيد', 'مزید دیکھیں')}
                </button>
              )}
            </>
          ) : null}
          {contact.ratingCount > 0 ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
              <FiStar className="w-3 h-3 fill-current" /> {contact.ratingAvg.toFixed(1)} ({contact.ratingCount})
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setReporting((v) => !v)}
          disabled={reported}
          aria-label={tr('Report', 'إبلاغ', 'رپورٹ')}
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 active:bg-gray-100 dark:active:bg-gray-700 disabled:opacity-40"
        >
          <FiFlag className="w-4 h-4" />
        </button>
      </div>

      {/* In-app DM — only when the number's owner is a registered user (and not you) */}
      {canDM && (
        <button
          type="button"
          onClick={startDM}
          className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-[13px] font-bold active:scale-[0.97] transition-transform"
        >
          <FiMessageCircle className="w-4 h-4" /> {tr('Message in app', 'مراسلة داخل التطبيق', 'ایپ میں پیغام')}
        </button>
      )}

      <div className="grid grid-cols-2 gap-2 mt-2">
        <button
          type="button"
          onClick={() => callPhone(contact.phone)}
          className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary-600 text-white text-[13px] font-bold active:scale-[0.97] transition-transform"
        >
          <FiPhone className="w-4 h-4" /> {tr('Call', 'اتصال', 'کال')}
        </button>
        {contact.whatsapp ? (
          <button
            type="button"
            onClick={() => openWhatsApp(contact.phone)}
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#25D366] text-white text-[13px] font-bold active:scale-[0.97] transition-transform"
          >
            <WhatsAppIcon className="w-4 h-4" /> {tr('WhatsApp', 'واتساب', 'واٹس ایپ')}
          </button>
        ) : (
          <span className="flex items-center justify-center py-2 rounded-xl bg-gray-50 dark:bg-gray-900/40 text-gray-400 text-[12px]" dir="ltr">{contact.phone}</span>
        )}
      </div>

      {/* Mod/admin + owner controls (edit / remove) */}
      {canManage && !editing && (
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/60">
          <button type="button" onClick={() => setEditing(true)} disabled={busy} className="flex items-center gap-1 text-[12px] font-medium text-gray-500 dark:text-gray-400 active:opacity-70">
            <FiEdit2 className="w-3.5 h-3.5" /> {tr('Edit', 'تعديل', 'ترمیم')}
          </button>
          <button type="button" onClick={remove} disabled={busy} className="flex items-center gap-1 text-[12px] font-medium text-red-500 active:opacity-70">
            <FiTrash2 className="w-3.5 h-3.5" /> {tr('Remove', 'إزالة', 'ہٹائیں')}
          </button>
        </div>
      )}

      {/* Inline edit form (mod/admin) */}
      {editing && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/60 space-y-2">
          <input value={fName} onChange={(e) => setFName(e.target.value)} maxLength={80}
            placeholder={tr('Name', 'الاسم', 'نام')}
            className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 text-sm" />
          <select value={fCat} onChange={(e) => setFCat(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 text-sm">
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.emoji} {lang === 'en' ? c.labelEn : lang === 'ur' ? c.labelUr : c.labelAr}</option>
            ))}
          </select>
          <input value={fArea} onChange={(e) => setFArea(e.target.value)} maxLength={120}
            placeholder={tr('Service area (optional)', 'نطاق الخدمة (اختياري)', 'علاقہ (اختیاری)')}
            className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 text-sm" />
          <textarea value={fDesc} onChange={(e) => setFDesc(e.target.value)} maxLength={280} rows={2}
            placeholder={tr('Description (optional)', 'الوصف (اختياري)', 'تفصیل (اختیاری)')}
            className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 text-sm resize-none" />
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 px-1">
            <input type="checkbox" checked={fWa} onChange={(e) => setFWa(e.target.checked)} /> {tr('WhatsApp available', 'متاح على واتساب', 'واٹس ایپ دستیاب')}
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={saveEdit} disabled={busy} className="flex-1 py-2 rounded-xl bg-primary-600 text-white text-[13px] font-bold active:scale-95 disabled:opacity-50">
              {tr('Save', 'حفظ', 'محفوظ')}
            </button>
            <button type="button" onClick={() => setEditing(false)} disabled={busy} className="flex-1 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-[13px] font-bold active:scale-95">
              {tr('Cancel', 'إلغاء', 'منسوخ')}
            </button>
          </div>
        </div>
      )}

      {reporting && !reported && (
        <div className="mt-2 rounded-xl border border-gray-200 dark:border-gray-700 p-2 space-y-1">
          <p className="text-[11px] text-gray-500 dark:text-gray-400 px-1">{tr('Report reason', 'سبب الإبلاغ', 'رپورٹ کی وجہ')}</p>
          {SERVICE_REPORT_REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => report(r.value)}
              className="w-full text-start px-2 py-1.5 rounded-lg text-[13px] text-gray-700 dark:text-gray-200 active:bg-gray-100 dark:active:bg-gray-700"
            >
              {lang === 'en' ? r.en : r.ar}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

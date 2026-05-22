'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { FiPhone, FiFlag, FiStar } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { callPhone, openWhatsApp } from '@/lib/openExternal'
import { getServiceCategoryMeta } from '@/lib/services/serviceCategories'
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

export default function ServiceContactCard({ contact }: { contact: PublicServiceContact }) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) => (lang === 'en' ? en : lang === 'ur' ? ur : ar)
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)

  const cat = getServiceCategoryMeta(contact.category as any)
  const catLabel = lang === 'en' ? cat.labelEn : lang === 'ur' ? cat.labelUr : cat.labelAr
  const trust = TRUST[contact.trust]

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
            <p className="text-[13px] text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">{contact.description}</p>
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

      <div className="grid grid-cols-2 gap-2 mt-3">
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

'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import {
  FiAlertTriangle,
  FiX,
  FiSend,
  FiClock,
  FiCheck,
  FiSlash,
} from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { useDragToDismiss } from '@/hooks/useDragToDismiss'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

/**
 * User-facing emergency alert request sheet.
 *
 * Regular users fill out title/body/severity and submit to the mod queue.
 * Nothing is broadcast until a mod approves — that protects the trust
 * in the red-banner alert system while still giving users a voice.
 *
 * Also shows the user's recent request history with status labels.
 */

type Severity = 'critical' | 'warning' | 'info'

interface MyRequest {
  id: string
  title: string
  body: string
  severity: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'
  rejectedReason: string | null
  createdAt: string
  expiresAt: string
  reviewedAt: string | null
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function EmergencyRequestSheet({ open, onClose }: Props) {
  const { lang } = useLanguage()
  const dn = (ar: string, en: string) => (lang === 'en' ? en : ar)
  const drag = useDragToDismiss<HTMLDivElement, HTMLDivElement>({ open, onDismiss: onClose })

  useBodyScrollLock(open)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [severity, setSeverity] = useState<Severity>('critical')
  const [submitting, setSubmitting] = useState(false)
  const [myRequests, setMyRequests] = useState<MyRequest[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoadingHistory(true)
    fetch('/api/emergency/requests/mine')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setMyRequests(Array.isArray(data) ? data : []))
      .catch(() => setMyRequests([]))
      .finally(() => setLoadingHistory(false))
  }, [open])

  async function handleSubmit() {
    if (submitting) return
    const t = title.trim()
    const b = body.trim()
    if (!t || t.length > 120) {
      toast.error(dn('عنوان مطلوب (≤120 حرف)', 'Title required (≤120 chars)'))
      return
    }
    if (!b || b.length > 500) {
      toast.error(dn('تفاصيل مطلوبة (≤500 حرف)', 'Details required (≤500 chars)'))
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/emergency/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, body: b, severity }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.error === 'pending_exists') {
          toast.error(
            dn(
              'لديك طلب معلّق بالفعل — انتظر قرار المشرف',
              'You already have a pending request',
            ),
          )
        } else if (data.error === 'rate_limited') {
          toast.error(
            dn(
              'تجاوزت عدد الطلبات المسموح بها اليوم',
              'Too many requests in the last 24 hours',
            ),
          )
        } else if (data.error === 'no_neighborhood') {
          toast.error(dn('يجب أن يكون لديك حي محدد', 'You must have a neighborhood'))
        } else {
          toast.error(data.error || dn('فشل الإرسال', 'Submit failed'))
        }
        setSubmitting(false)
        return
      }
      toast.success(
        dn(
          'تم إرسال الطلب — سيراجعه المشرف قريباً',
          'Request sent — a mod will review it shortly',
        ),
      )
      setTitle('')
      setBody('')
      // Reload history so the new PENDING row appears
      const res2 = await fetch('/api/emergency/requests/mine')
      if (res2.ok) setMyRequests(await res2.json())
    } catch {
      toast.error(dn('فشل الاتصال', 'Connection failed'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        ref={drag.sheetRef}
        className="bg-white dark:bg-gray-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <div ref={drag.handleRef} className="px-5 pt-3 touch-none">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900 dark:text-white text-lg flex items-center gap-2">
              <FiAlertTriangle className="w-5 h-5 text-red-600" />
              {dn('الإبلاغ عن حالة طارئة', 'Report an emergency')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="px-5 pb-5">

        {/* Info banner */}
        <div className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-3 mb-4 leading-relaxed">
          ℹ️{' '}
          {dn(
            'سيراجع المشرف طلبك قبل إرساله لكل جيرانك. لا تُرسل طلبات زائفة — قد يؤدي ذلك لحظر حسابك.',
            "A mod will review your request before it's broadcast. Don't submit false reports — your account may be banned.",
          )}
        </div>

        {/* Severity */}
        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
            {dn('مستوى الخطورة', 'Severity')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['critical', 'warning', 'info'] as Severity[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                className={`py-2 rounded-xl text-xs font-bold transition-all ${
                  severity === s
                    ? s === 'critical'
                      ? 'bg-red-600 text-white'
                      : s === 'warning'
                        ? 'bg-amber-500 text-white'
                        : 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                }`}
              >
                {severityLabel(s, lang)}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div className="mb-3">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            {dn('العنوان', 'Title')} ({title.length}/120)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 120))}
            placeholder={dn(
              'مثال: حريق في المبنى المجاور',
              'e.g. Fire in a nearby building',
            )}
            className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
            maxLength={120}
          />
        </div>

        {/* Body */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
            {dn('التفاصيل', 'Details')} ({body.length}/500)
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 500))}
            placeholder={dn(
              'مكان الحادث، الوقت، ما يجب فعله',
              'Location, time, what to do',
            )}
            rows={4}
            className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            maxLength={500}
          />
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !title.trim() || !body.trim()}
          className="w-full py-3 bg-red-600 text-white font-bold text-sm rounded-xl active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-4"
        >
          <FiSend className="w-4 h-4" />
          {submitting
            ? dn('جاري الإرسال...', 'Sending...')
            : dn('إرسال الطلب', 'Submit request')}
        </button>

        {/* My requests history */}
        {(loadingHistory || myRequests.length > 0) && (
          <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
              {dn('طلباتي السابقة', 'My previous requests')}
            </p>
            {loadingHistory ? (
              <div className="h-12 bg-gray-50 dark:bg-gray-800 rounded-xl animate-pulse" />
            ) : (
              <div className="space-y-2">
                {myRequests.slice(0, 5).map((r) => (
                  <RequestStatusRow key={r.id} r={r} lang={lang} />
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

function severityLabel(severity: string, lang: string): string {
  if (severity === 'critical') return lang === 'en' ? 'Critical' : 'حرج'
  if (severity === 'warning') return lang === 'en' ? 'Warning' : 'تحذير'
  return lang === 'en' ? 'Info' : 'معلومة'
}

function RequestStatusRow({ r, lang }: { r: MyRequest; lang: string }) {
  const dn = (ar: string, en: string) => (lang === 'en' ? en : ar)
  const status = r.status

  let statusIcon
  let statusColor
  let statusLabel
  switch (status) {
    case 'PENDING':
      statusIcon = <FiClock className="w-3.5 h-3.5" />
      statusColor = 'text-amber-600 bg-amber-50 dark:bg-amber-900/20'
      statusLabel = dn('قيد المراجعة', 'Pending review')
      break
    case 'APPROVED':
      statusIcon = <FiCheck className="w-3.5 h-3.5" />
      statusColor = 'text-green-600 bg-green-50 dark:bg-green-900/20'
      statusLabel = dn('تم الإرسال', 'Approved')
      break
    case 'REJECTED':
      statusIcon = <FiSlash className="w-3.5 h-3.5" />
      statusColor = 'text-red-600 bg-red-50 dark:bg-red-900/20'
      statusLabel = dn('مرفوض', 'Rejected')
      break
    case 'EXPIRED':
      statusIcon = <FiClock className="w-3.5 h-3.5" />
      statusColor = 'text-gray-500 bg-gray-50 dark:bg-gray-800'
      statusLabel = dn('منتهي', 'Expired')
      break
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor}`}
        >
          {statusIcon}
          {statusLabel}
        </span>
        <span className="text-[10px] text-gray-400">
          {new Date(r.createdAt).toLocaleDateString(
            lang === 'en' ? 'en-US' : 'ar-SA',
            { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
          )}
        </span>
      </div>
      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 line-clamp-1">
        {r.title}
      </p>
      {status === 'REJECTED' && r.rejectedReason && (
        <p className="text-[10px] text-red-600 dark:text-red-400 mt-1">
          {dn('السبب:', 'Reason:')} {r.rejectedReason}
        </p>
      )}
    </div>
  )
}

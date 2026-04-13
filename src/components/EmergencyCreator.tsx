'use client'

import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  FiAlertTriangle,
  FiX,
  FiCheck,
  FiSend,
  FiTrash2,
  FiShield,
} from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'

type Severity = 'critical' | 'warning' | 'info'

interface ActiveAlert {
  id: string
  title: string
  body: string
  severity: string
  expiresAt: string
  authorName: string | null
}

export default function EmergencyCreator() {
  const { lang } = useLanguage()
  const dn = (ar: string, en: string) => (lang === 'en' ? en : ar)

  const [active, setActive] = useState<ActiveAlert[]>([])
  const [loadingActive, setLoadingActive] = useState(true)
  const [open, setOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/emergency/active')
      if (!res.ok) {
        setActive([])
        return
      }
      const data = await res.json()
      setActive(Array.isArray(data) ? data : [])
    } catch {
      setActive([])
    } finally {
      setLoadingActive(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleRevoke(id: string) {
    if (
      !confirm(
        dn(
          'هل أنت متأكد من إلغاء هذا التنبيه؟',
          'Are you sure you want to revoke this alert?',
        ),
      )
    ) {
      return
    }
    try {
      const res = await fetch(`/api/emergency/${id}/revoke`, { method: 'POST' })
      if (res.ok) {
        toast.success(dn('تم الإلغاء', 'Revoked'))
        refresh()
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error || dn('فشل الإلغاء', 'Revoke failed'))
      }
    } catch {
      toast.error(dn('فشل الاتصال', 'Connection failed'))
    }
  }

  return (
    <div className="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/10 dark:to-orange-900/10 border border-red-200 dark:border-red-900/30 rounded-2xl p-4 mb-3">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center flex-shrink-0">
          <FiShield className="w-5 h-5 text-red-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-gray-900 dark:text-white">
            {dn('تنبيهات عاجلة', 'Emergency Alerts')}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
            {dn(
              'ينتشر للجميع في حيّك مع إشعار فوري. حد أقصى واحد كل ساعة.',
              'Broadcasts to everyone with instant push. Max 1 per hour.',
            )}
          </p>
        </div>
      </div>

      {loadingActive ? (
        <div className="h-10 bg-white/50 dark:bg-black/10 rounded-xl animate-pulse" />
      ) : active.length > 0 ? (
        <div className="space-y-2">
          {active.map((a) => (
            <div
              key={a.id}
              className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-red-200 dark:border-red-900/40"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-xs font-bold text-red-600 dark:text-red-400 uppercase">
                  {severityLabel(a.severity, lang)}
                </p>
                <button
                  type="button"
                  onClick={() => handleRevoke(a.id)}
                  className="text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1 active:opacity-60"
                >
                  <FiTrash2 className="w-3 h-3" />
                  {dn('إلغاء', 'Revoke')}
                </button>
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-1">
                {a.title}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                {dn('ينتهي', 'Expires')}{' '}
                {new Date(a.expiresAt).toLocaleTimeString(
                  lang === 'en' ? 'en-US' : 'ar-SA',
                  { hour: '2-digit', minute: '2-digit' },
                )}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full py-3 bg-red-600 text-white font-bold text-sm rounded-xl active:scale-95 transition-transform flex items-center justify-center gap-2 shadow-lg shadow-red-600/30"
        >
          <FiAlertTriangle className="w-4 h-4" />
          {dn('إنشاء تنبيه عاجل', 'Create Emergency Alert')}
        </button>
      )}

      {open && (
        <EmergencyCreateModal
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function severityLabel(severity: string, lang: string): string {
  if (severity === 'critical') return lang === 'en' ? 'Critical' : 'حرج'
  if (severity === 'warning') return lang === 'en' ? 'Warning' : 'تحذير'
  return lang === 'en' ? 'Info' : 'معلومة'
}

// ─── Modal ──────────────────────────────────────────────────────────────
function EmergencyCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const { lang } = useLanguage()
  const dn = (ar: string, en: string) => (lang === 'en' ? en : ar)

  const [stage, setStage] = useState<'form' | 'confirm'>('form')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [severity, setSeverity] = useState<Severity>('critical')
  const [confirmToken, setConfirmToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleContinue() {
    if (loading) return
    const t = title.trim()
    const b = body.trim()
    if (!t || t.length > 120) {
      toast.error(dn('عنوان مطلوب (≤120 حرف)', 'Title required (≤120 chars)'))
      return
    }
    if (!b || b.length > 500) {
      toast.error(dn('نص مطلوب (≤500 حرف)', 'Body required (≤500 chars)'))
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/emergency/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, body: b, severity }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(humanizeError(data.error, lang))
        return
      }
      if (data.confirmRequired && data.confirmToken) {
        setConfirmToken(data.confirmToken)
        setStage('confirm')
      } else {
        toast.error(dn('استجابة غير متوقعة', 'Unexpected response'))
      }
    } catch {
      toast.error(dn('فشل الاتصال', 'Connection failed'))
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (loading || !confirmToken) return
    setLoading(true)
    try {
      const res = await fetch('/api/emergency/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          severity,
          confirmToken,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(humanizeError(data.error, lang))
        if (data.error === 'confirm_expired' || data.error === 'invalid_confirm') {
          setStage('form')
          setConfirmToken(null)
        }
        return
      }
      toast.success(dn('تم إرسال التنبيه', 'Alert sent'))
      onCreated()
    } catch {
      toast.error(dn('فشل الاتصال', 'Connection failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900 dark:text-white text-lg flex items-center gap-2">
            <FiAlertTriangle className="w-5 h-5 text-red-600" />
            {stage === 'form'
              ? dn('تنبيه عاجل جديد', 'New Emergency Alert')
              : dn('تأكيد الإرسال', 'Confirm & Send')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {stage === 'form' ? (
          <div className="space-y-4">
            {/* Severity selector */}
            <div>
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
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                {dn('العنوان', 'Title')} ({title.length}/120)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 120))}
                placeholder={dn(
                  'مثال: انقطاع مياه مفاجئ في الحي',
                  'e.g. Sudden water outage',
                )}
                className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                maxLength={120}
              />
            </div>

            {/* Body */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                {dn('التفاصيل', 'Details')} ({body.length}/500)
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, 500))}
                placeholder={dn(
                  'اشرح الوضع باختصار — مكان، سبب، ما يجب فعله',
                  'Briefly describe location, cause, what to do',
                )}
                rows={4}
                className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                maxLength={500}
              />
            </div>

            <div className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-2.5 leading-relaxed">
              ⚠️{' '}
              {dn(
                'هذا التنبيه سيظهر لكل جار في حيّك لمدة ساعتين ويرسل إشعار فوري.',
                'This alert will show to every neighbor for 2 hours and send an immediate push notification.',
              )}
            </div>

            <button
              type="button"
              onClick={handleContinue}
              disabled={loading || !title.trim() || !body.trim()}
              className="w-full py-3 bg-red-600 text-white font-bold text-sm rounded-xl active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? dn('جاري...', 'Loading...')
                : dn('متابعة', 'Continue')}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-900/40 rounded-xl p-4">
              <p className="text-xs font-bold text-red-600 dark:text-red-400 uppercase mb-2">
                {severityLabel(severity, lang)}
              </p>
              <p className="font-bold text-gray-900 dark:text-white text-base mb-2">
                {title}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {body}
              </p>
            </div>

            <div className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-xl p-3 leading-relaxed space-y-1.5">
              <p className="flex items-start gap-2">
                <FiCheck className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                {dn(
                  'سيظهر كبانر أحمر في بداية feed كل جار',
                  'Will appear as a red banner at the top of every neighbor\'s feed',
                )}
              </p>
              <p className="flex items-start gap-2">
                <FiCheck className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                {dn(
                  'إشعار فوري بأولوية عالية',
                  'Instant high-priority push notification',
                )}
              </p>
              <p className="flex items-start gap-2">
                <FiCheck className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                {dn('ينتهي تلقائياً بعد ساعتين', 'Auto-expires after 2 hours')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStage('form')}
                disabled={loading}
                className="py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold text-sm rounded-xl active:scale-95 transition-transform disabled:opacity-50"
              >
                {dn('رجوع', 'Back')}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="py-3 bg-red-600 text-white font-bold text-sm rounded-xl active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <FiSend className="w-4 h-4" />
                {loading
                  ? dn('جاري الإرسال...', 'Sending...')
                  : dn('إرسال', 'Send')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function humanizeError(code: string | undefined, lang: string): string {
  const dn = (ar: string, en: string) => (lang === 'en' ? en : ar)
  switch (code) {
    case 'forbidden':
      return dn('ليست لديك صلاحية', 'Not authorized')
    case 'no_neighborhood':
      return dn('ليس لديك حي محدد', 'No neighborhood set')
    case 'invalid_title':
      return dn('عنوان غير صالح', 'Invalid title')
    case 'invalid_body_text':
      return dn('نص غير صالح', 'Invalid body')
    case 'invalid_severity':
      return dn('مستوى غير صالح', 'Invalid severity')
    case 'rate_limited':
      return dn(
        'تم إرسال تنبيه في آخر ساعة',
        'An alert was sent in the last hour',
      )
    case 'confirm_expired':
      return dn('انتهت صلاحية التأكيد', 'Confirmation expired')
    case 'invalid_confirm':
      return dn('رمز التأكيد غير صالح', 'Invalid confirmation')
    default:
      return dn('حصل خطأ', 'Something went wrong')
  }
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiArrowRight, FiArrowLeft, FiPlus, FiTrash2 } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import BackButton from '@/components/BackButton'
import { HaiSpinner } from '@/components/HaiLoader'
import { POLL_REQUEST_LIMITS, type ValidationCode } from '@/lib/pollRequest'

const ERROR_COPY: Record<ValidationCode | 'rate_limited' | 'unknown', { ar: string; en: string; ur: string }> = {
  title_too_short:           { ar: 'العنوان قصير جداً (5 أحرف على الأقل)', en: 'Title is too short (min 5 chars)', ur: 'عنوان بہت مختصر ہے' },
  title_too_long:            { ar: 'العنوان طويل جداً (الحد 120)',        en: 'Title is too long (max 120)',      ur: 'عنوان بہت لمبا ہے' },
  description_too_long:      { ar: 'الوصف طويل جداً (الحد 500)',           en: 'Description too long (max 500)',   ur: 'تفصیل بہت لمبی ہے' },
  options_count:             { ar: 'يجب أن يكون عدد الخيارات بين 2 و 8',   en: 'Need 2–8 options',                 ur: 'خیارات 2 سے 8 کے درمیان' },
  option_too_short:          { ar: 'هناك خيار قصير جداً',                   en: 'An option is too short',           ur: 'ایک خیار بہت مختصر' },
  option_too_long:           { ar: 'هناك خيار طويل جداً (الحد 80)',         en: 'An option is too long (max 80)',   ur: 'ایک خیار بہت لمبا' },
  option_blank_or_invisible: { ar: 'هناك خيار فارغ — أكمل النص',           en: 'An option is blank',               ur: 'ایک خیار خالی ہے' },
  duplicate_options:         { ar: 'لا يمكن تكرار نفس الخيار',              en: 'Options must be unique',           ur: 'خیارات منفرد ہوں' },
  reason_too_long:           { ar: 'سبب الاقتراح طويل جداً (الحد 300)',     en: 'Reason too long (max 300)',        ur: 'وجہ بہت لمبی' },
  rate_limited:              { ar: 'تجاوزت الحد المسموح هذا الأسبوع',       en: 'Weekly limit reached',             ur: 'ہفتہ وار حد پوری ہو گئی' },
  unknown:                   { ar: 'حدث خطأ — حاول مرة أخرى',              en: 'Something went wrong — try again', ur: 'کچھ غلط ہو گیا' },
}

export default function PollRequestClient() {
  const router = useRouter()
  const { lang } = useLanguage()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function addOption() {
    if (options.length >= POLL_REQUEST_LIMITS.options.max) return
    setOptions(prev => [...prev, ''])
  }
  function removeOption(i: number) {
    if (options.length <= POLL_REQUEST_LIMITS.options.min) return
    setOptions(prev => prev.filter((_, j) => j !== i))
  }
  function updateOption(i: number, v: string) {
    setOptions(prev => prev.map((o, j) => (j === i ? v : o)))
  }

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/poll-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          options,
          reason: reason.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const code = (data?.error as keyof typeof ERROR_COPY) || 'unknown'
        const copy = ERROR_COPY[code] || ERROR_COPY.unknown
        toast.error(lang === 'en' ? copy.en : lang === 'ur' ? copy.ur : copy.ar, { duration: 4500 })
        return
      }
      toast.success(
        lang === 'en'
          ? 'Sent for mod review — you’ll be notified when reviewed.'
          : lang === 'ur'
            ? 'منتظم کیلئے بھیج دیا — جواب پر اطلاع ملے گی۔'
            : 'تم إرسال طلب الاستفتاء لمشرف الحي للمراجعة',
        { duration: 4500 },
      )
      router.push('/feed')
    } catch {
      toast.error(lang === 'en' ? ERROR_COPY.unknown.en : lang === 'ur' ? ERROR_COPY.unknown.ur : ERROR_COPY.unknown.ar)
    } finally {
      setSubmitting(false)
    }
  }

  // Live front-end validity for the submit button — exact same rules
  // as the server, just no zero-width / dedup check here (server catches).
  const canSubmit =
    title.trim().length >= POLL_REQUEST_LIMITS.title.min &&
    title.trim().length <= POLL_REQUEST_LIMITS.title.max &&
    description.trim().length <= POLL_REQUEST_LIMITS.description.max &&
    reason.trim().length <= POLL_REQUEST_LIMITS.reason.max &&
    options.length >= POLL_REQUEST_LIMITS.options.min &&
    options.length <= POLL_REQUEST_LIMITS.options.max &&
    options.every(o => {
      const t = o.trim()
      return t.length >= POLL_REQUEST_LIMITS.option.min && t.length <= POLL_REQUEST_LIMITS.option.max
    })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
        <BackButton href="/feed" />
        <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1">
          🗳️ {lang === 'en' ? 'Suggest a poll' : lang === 'ur' ? 'پول تجویز کریں' : 'اقترح استفتاء'}
        </h1>
      </header>

      <div className="px-4 py-4 space-y-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-3">
          <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
            {lang === 'en'
              ? 'Your suggestion goes to a neighborhood mod for review. If approved, a real poll is created and your neighbors can vote.'
              : lang === 'ur'
                ? 'آپ کی تجویز محلے کے منتظم کو بھیجی جائے گی۔ منظوری پر پول بن جائے گا۔'
                : 'سيتم إرسال اقتراحك لمشرف الحي للمراجعة. عند الموافقة سيتم إنشاء استفتاء فعلي يصوّت عليه الجيران.'}
          </p>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
            {lang === 'en' ? 'Question / title' : lang === 'ur' ? 'سوال' : 'السؤال'}
            <span className="text-red-500"> *</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={POLL_REQUEST_LIMITS.title.max + 20}
            placeholder={lang === 'en' ? 'e.g. Do we need a walkway on Sixty Street?' : lang === 'ur' ? 'مثال: کیا ہمیں واکوے چاہیے؟' : 'مثال: هل نحتاج ممشى في شارع الستين؟'}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <p className="text-[10px] text-gray-400 mt-1">{title.trim().length}/{POLL_REQUEST_LIMITS.title.max}</p>
        </div>

        {/* Description (optional) */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
            {lang === 'en' ? 'More detail (optional)' : lang === 'ur' ? 'مزید تفصیل (اختیاری)' : 'تفاصيل إضافية (اختياري)'}
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={POLL_REQUEST_LIMITS.description.max + 50}
            rows={3}
            placeholder={lang === 'en' ? 'Context that helps neighbors understand the question…' : lang === 'ur' ? 'مزید معلومات…' : 'سياق يساعد الجيران…'}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
          <p className="text-[10px] text-gray-400 mt-1">{description.trim().length}/{POLL_REQUEST_LIMITS.description.max}</p>
        </div>

        {/* Options */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
            {lang === 'en' ? 'Options' : lang === 'ur' ? 'خیارات' : 'الخيارات'}
            <span className="text-red-500"> *</span>
            <span className="text-[10px] font-normal text-gray-400 ms-2">
              {options.length}/{POLL_REQUEST_LIMITS.options.max}
            </span>
          </label>
          <div className="space-y-2">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={o}
                  onChange={e => updateOption(i, e.target.value)}
                  maxLength={POLL_REQUEST_LIMITS.option.max + 10}
                  placeholder={lang === 'en' ? `Option ${i + 1}` : lang === 'ur' ? `خیار ${i + 1}` : `خيار ${i + 1}`}
                  className="flex-1 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                {options.length > POLL_REQUEST_LIMITS.options.min && (
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    className="p-2 text-gray-400 hover:text-red-500 active:scale-90"
                    aria-label={lang === 'en' ? 'Remove option' : 'حذف الخيار'}
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < POLL_REQUEST_LIMITS.options.max && (
            <button
              type="button"
              onClick={addOption}
              className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 active:scale-95"
            >
              <FiPlus className="w-3.5 h-3.5" />
              {lang === 'en' ? 'Add option' : lang === 'ur' ? 'خیار شامل کریں' : 'إضافة خيار'}
            </button>
          )}
        </div>

        {/* Reason (optional) */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
            {lang === 'en' ? 'Why suggest this poll? (optional, mod-only)' : lang === 'ur' ? 'یہ پول کیوں؟ (اختیاری)' : 'سبب الاقتراح (اختياري، يراه المشرف فقط)'}
          </label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            maxLength={POLL_REQUEST_LIMITS.reason.max + 30}
            rows={2}
            placeholder={lang === 'en' ? 'Helps the mod decide quickly…' : lang === 'ur' ? 'منتظم کے فیصلے میں مدد…' : 'يساعد المشرف على القرار…'}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
          <p className="text-[10px] text-gray-400 mt-1">{reason.trim().length}/{POLL_REQUEST_LIMITS.reason.max}</p>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full bg-primary-600 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
        >
          {submitting ? <HaiSpinner /> : (
            <>
              {lang !== 'en' ? <FiArrowLeft className="w-4 h-4" /> : <FiArrowRight className="w-4 h-4" />}
              <span>{lang === 'en' ? 'Send to mod' : lang === 'ur' ? 'منتظم کو بھیجیں' : 'إرسال للمشرف'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}

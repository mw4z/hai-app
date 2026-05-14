'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiArrowLeft, FiArrowRight, FiPlus, FiTrash2 } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { HaiSpinner } from '@/components/HaiLoader'

const MAX_OPTIONS = 6
const MIN_OPTIONS = 2

/** Admin-only direct poll creation. Same surface as
 *  /polls/request (resident "suggest a poll" flow) but POSTs to
 *  /api/polls instead of /api/poll-requests — no mod review,
 *  publishes immediately. */
export default function PollCreateClient() {
  const router = useRouter()
  const { lang } = useLanguage()

  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [loading, setLoading] = useState(false)

  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  function setOption(i: number, v: string) {
    setOptions((prev) => prev.map((o, j) => (i === j ? v : o)))
  }
  function addOption() {
    if (options.length >= MAX_OPTIONS) return
    setOptions((prev) => [...prev, ''])
  }
  function removeOption(i: number) {
    if (options.length <= MIN_OPTIONS) return
    setOptions((prev) => prev.filter((_, j) => j !== i))
  }

  async function submit() {
    if (loading) return
    if (!question.trim()) {
      toast.error(tr('Add a question', 'أضف سؤال التصويت', 'سوال شامل کریں'))
      return
    }
    const opts = options.map((o) => o.trim()).filter(Boolean)
    if (opts.length < MIN_OPTIONS) {
      toast.error(tr('Add at least 2 options', 'أضف خيارين على الأقل', 'کم از کم 2 اختیارات شامل کریں'))
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), options: opts }),
      })
      if (res.ok) {
        toast.success(tr('Poll published', 'تم نشر التصويت', 'پول شائع ہو گیا'))
        router.push('/feed')
        return
      }
      const d = await res.json().catch(() => ({}))
      toast.error(d?.error || tr('Failed', 'فشل', 'ناکام'))
    } catch {
      toast.error(tr('Connection failed', 'فشل الاتصال', 'کنیکشن ناکام'))
    } finally {
      setLoading(false)
    }
  }

  const ArrowIcon = lang === 'en' ? FiArrowLeft : FiArrowRight

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Safe-area cover — same direct-paint pattern the directory
          pages use, so the notch zone matches the page bg without
          relying on the global html::before variable. */}
      <div
        aria-hidden
        className="fixed top-0 left-0 right-0 z-30 pointer-events-none bg-gray-50 dark:bg-gray-900"
        style={{ height: 'env(safe-area-inset-top, 0px)' }}
      />
      {/* Header is fully opaque (no /95 + backdrop-blur). Same
          rationale as DirectoryHeader: the translucent + blur
          combo produced a visibly darker tone than the
          surrounding solid bg-gray-900, so the bar read as a
          separate band on dark mode. Solid bg matches the
          page wrapper and the safe-area cover above. */}
      <header className="sticky top-0 z-30 bg-gray-50 dark:bg-gray-900 border-b border-gray-200/60 dark:border-gray-700/60">
        <div className="max-w-[640px] mx-auto px-3 py-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label={tr('Back', 'رجوع', 'واپس')}
            className="w-10 h-10 flex items-center justify-center rounded-full text-gray-700 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800"
          >
            <ArrowIcon className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-base font-bold text-gray-900 dark:text-white truncate">
            📊 {tr('Create poll', 'إنشاء تصويت', 'پول بنائیں')}
          </h1>
        </div>
      </header>

      <div className="max-w-[640px] mx-auto px-4 py-4 space-y-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {tr(
            'Published immediately. Residents in your neighborhood will see it in their feed.',
            'يُنشر مباشرة. سيراه سكان حيّك في صفحتهم الرئيسية.',
            'فوری شائع ہو گا۔ آپ کے محلے کے رہائشی اپنی فیڈ میں دیکھیں گے۔',
          )}
        </p>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <label className="block">
            <span className="block text-[12px] font-medium text-gray-600 dark:text-gray-400 mb-1">
              {tr('Question', 'السؤال', 'سوال')}
            </span>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={tr('What is the poll question?', 'ما هو سؤال التصويت؟', 'سوال کیا ہے؟')}
              maxLength={200}
              autoFocus
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>

          <div className="space-y-2">
            <span className="block text-[12px] font-medium text-gray-600 dark:text-gray-400">
              {tr('Options', 'الخيارات', 'اختیارات')}
            </span>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-5 tabular-nums">{i + 1}.</span>
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`${tr('Option', 'خيار', 'اختیار')} ${i + 1}`}
                  maxLength={80}
                  className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                {options.length > MIN_OPTIONS && (
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    aria-label={tr('Remove option', 'إزالة', 'ہٹائیں')}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:bg-gray-100 dark:active:bg-gray-700"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {options.length < MAX_OPTIONS && (
              <button
                type="button"
                onClick={addOption}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 dark:text-primary-400"
              >
                <FiPlus className="w-3.5 h-3.5" />
                {tr('Add another option', 'إضافة خيار آخر', 'مزید اختیار شامل کریں')}
              </button>
            )}
          </div>
        </div>

        <button
          onClick={submit}
          disabled={loading}
          className="w-full py-3 rounded-2xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50 active:scale-95 transition-transform"
        >
          {loading
            ? <HaiSpinner />
            : tr('Publish poll', 'نشر التصويت', 'پول شائع کریں')}
        </button>
      </div>
    </main>
  )
}

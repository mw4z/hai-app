'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiAlertCircle } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import type { TranslationKey } from '@/lib/i18n'
import { detectSquareIntent } from '@/lib/square/detectIntent'

const TYPES: { value: 'QUESTION' | 'NOTE' | 'DISCUSSION' | 'LIGHT_ALERT'; tKey: TranslationKey; emoji: string }[] = [
  { value: 'QUESTION',    tKey: 'square_type_question',    emoji: '❓' },
  { value: 'NOTE',        tKey: 'square_type_note',        emoji: '📝' },
  { value: 'DISCUSSION',  tKey: 'square_type_discussion',  emoji: '💬' },
  { value: 'LIGHT_ALERT', tKey: 'square_type_light_alert', emoji: '⚡' },
]

/** Square thread composer — text-only by design. Note the deliberate
 *  absence of any image / file / voice attach UI. The placeholder copy
 *  + the no-media notice make the policy explicit; the API layer
 *  enforces it independently.
 *
 *  Soft-nudge banner runs detectSquareIntent() on every keystroke
 *  (cheap regex, debounce not needed) and surfaces the suggestion if
 *  the content looks like it belongs in another section. HARD signals
 *  (group invite, repeat phone promo) also show the banner — but
 *  publish is still blocked at the API; the banner just gives the
 *  user an early heads-up so they don't waste a tap. */
export default function SquareComposer() {
  const { t, lang } = useLanguage()
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState<typeof TYPES[number]['value']>('DISCUSSION')
  const [submitting, setSubmitting] = useState(false)

  const intent = useMemo(
    () => detectSquareIntent(`${title}\n${body}`),
    [title, body],
  )

  const canSubmit =
    title.trim().length >= 4 && title.trim().length <= 140 && !submitting

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/square', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim() || undefined, type }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(
          typeof data.error === 'string'
            ? data.error
            : data.error?.message || t('square_create_failed'),
        )
        return
      }
      const id = data?.thread?.id
      if (id) router.replace(`/square/${id}`)
      else router.replace('/square')
    } catch {
      toast.error(t('square_create_failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Type picker — small chip row, defaults to "نقاش". */}
      <div className="flex gap-1.5 flex-wrap">
        {TYPES.map((opt) => {
          const active = type === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(opt.value)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                active
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
              }`}
            >
              <span aria-hidden>{opt.emoji}</span>
              <span>{t(opt.tKey)}</span>
            </button>
          )
        })}
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('square_compose_title')}
        maxLength={160}
        className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[15px] font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('square_compose_body')}
        rows={6}
        maxLength={2200}
        className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[14px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
      />

      {/* Soft / hard nudge banner. HARD = red border + alert icon;
          SOFT = amber, advisory only. The user can still submit a
          SOFT-nudged thread; the API blocks HARD-nudged ones with
          the same message. */}
      {intent && (
        <div
          className={`flex items-start gap-2 px-3 py-2.5 rounded-xl text-[12.5px] leading-relaxed ${
            intent.hard
              ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200'
              : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-100'
          }`}
        >
          <FiAlertCircle className="w-4 h-4 mt-[2px] flex-shrink-0" />
          <span>{intent.messageAr}</span>
        </div>
      )}

      {/* Text-only policy hint — quiet, but always present so the rule
          isn't a surprise. */}
      <p className="text-[11.5px] text-gray-500 dark:text-gray-400 leading-relaxed">
        {t('square_no_media_notice')}
      </p>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={!canSubmit}
          className={`flex-1 px-4 py-3 rounded-2xl text-[15px] font-bold transition-transform active:scale-95 ${
            canSubmit
              ? 'bg-primary-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
          }`}
        >
          {submitting ? '…' : t('square_publish')}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-3 rounded-2xl text-[14px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 active:scale-95 transition-transform"
        >
          {t('square_cancel')}
        </button>
      </div>
      {/* Hidden but harmless RTL hint for ltr-only assistive tools. */}
      <span className="sr-only" aria-hidden>{lang}</span>
    </form>
  )
}

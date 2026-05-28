'use client'

import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { FiAlertCircle, FiSend } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { detectSquareIntent } from '@/lib/square/detectIntent'
import type { PublicSquareMessage } from '@/lib/square/serializeMessage'

interface Props {
  /** Called after a successful send so the parent can append to the
   *  list + auto-scroll. Receives the freshly-created message. */
  onSent: (message: PublicSquareMessage) => void
}

/**
 * Sticky bottom Square composer. Single text field + send button.
 *
 * Deliberately bare:
 *   - NO title field (this is a chronological message space, not a
 *     thread composer).
 *   - NO media affordances (text-only is enforced server-side too).
 *   - NO kind picker in MVP — messages default to GENERAL. The schema
 *     keeps the column for a future, post-data UI nudge.
 *
 * Soft-nudge banner runs detectSquareIntent() on every keystroke; HARD
 * signals (group invite, repeated phone) show the same banner red and
 * the API rejects on send.
 */
export default function SquareComposer({ onSent }: Props) {
  const { t, lang } = useLanguage()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const intent = useMemo(() => detectSquareIntent(body), [body])

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/square/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(
          typeof data.error === 'string'
            ? data.error
            : data.error?.message || t('square_send_failed'),
        )
        return
      }
      if (data?.message) {
        onSent(data.message as PublicSquareMessage)
        setBody('')
      }
    } catch {
      toast.error(t('square_send_failed'))
    } finally {
      setSending(false)
    }
  }

  return (
    <form
      onSubmit={send}
      className="fixed inset-x-0 z-10 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700"
      style={{
        // Sits just above the bottom nav (5rem ≈ tab bar height + safe area).
        bottom: 'calc(var(--hai-safe-bottom, 0px) + 4rem)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="max-w-[640px] mx-auto px-3 py-2 space-y-1.5">
        {intent && (
          <div
            className={`flex items-start gap-2 px-3 py-2 rounded-xl text-[12px] leading-relaxed ${
              intent.hard
                ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200'
                : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-100'
            }`}
          >
            <FiAlertCircle className="w-4 h-4 mt-[2px] flex-shrink-0" />
            <span>{intent.messageAr}</span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('square_message_placeholder')}
            rows={1}
            maxLength={900}
            className="flex-1 px-3 py-2.5 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[14px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            style={{ maxHeight: 140 }}
          />
          <button
            type="submit"
            disabled={!body.trim() || sending}
            className={`px-4 py-2.5 rounded-2xl text-[14px] font-bold transition-transform active:scale-95 inline-flex items-center gap-1.5 ${
              body.trim() && !sending
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            }`}
            aria-label={t('square_message_send')}
          >
            <FiSend className="w-4 h-4" />
            <span className="hidden sm:inline">{t('square_message_send')}</span>
          </button>
        </div>
      </div>
      <span className="sr-only" aria-hidden>{lang}</span>
    </form>
  )
}

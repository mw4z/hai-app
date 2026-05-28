'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FiArrowLeft, FiArrowRight, FiAlertCircle } from 'react-icons/fi'
import toast from 'react-hot-toast'
import { useLanguage } from '@/hooks/useLanguage'
import { fullName } from '@/lib/displayName'
import { detectSquareIntent } from '@/lib/square/detectIntent'
import type { PublicSquareThread, PublicSquareReply } from '@/lib/square/serializeThread'
import SquareTypeBadge from '@/components/square/SquareTypeBadge'
import SquareReplyRow from '@/components/square/SquareReplyRow'
import SquareFollowButton from '@/components/square/SquareFollowButton'

interface Props {
  thread: PublicSquareThread
  initialReplies: PublicSquareReply[]
  hasMoreReplies: boolean
}

/** Square thread detail: header (back, type, pinned, follow), thread
 *  body, reply list, sticky text-only reply composer. */
export default function SquareDetailClient({ thread, initialReplies, hasMoreReplies: initialHasMore }: Props) {
  const { t, lang } = useLanguage()
  const router = useRouter()

  const [replies, setReplies] = useState<PublicSquareReply[]>(initialReplies)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, setLoadingMore] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  const authorName =
    fullName(thread.author) || thread.author.name || (lang === 'en' ? 'Anonymous' : 'مجهول')

  const intent = useMemo(() => detectSquareIntent(replyText), [replyText])

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/square/${thread.id}/replies?offset=${replies.length}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      const next: PublicSquareReply[] = Array.isArray(data?.replies) ? data.replies : []
      setReplies((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...next.filter((p) => !seen.has(p.id))]
      })
      setHasMore(!!data.hasMore)
    } catch { /* swallow */ } finally {
      setLoadingMore(false)
    }
  }

  async function sendReply(e?: React.FormEvent) {
    e?.preventDefault()
    const body = replyText.trim()
    if (!body || sending) {
      if (!body) toast.error(t('square_reply_required'))
      return
    }
    setSending(true)
    try {
      const res = await fetch(`/api/square/${thread.id}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(
          typeof data.error === 'string'
            ? data.error
            : data.error?.message || t('square_reply_failed'),
        )
        return
      }
      if (data?.reply) {
        setReplies((prev) => [...prev, data.reply as PublicSquareReply])
        setReplyText('')
      }
    } catch {
      toast.error(t('square_reply_failed'))
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-[640px] mx-auto px-4 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-700"
            aria-label={lang === 'en' ? 'Back' : 'رجوع'}
          >
            {lang === 'en' ? <FiArrowLeft className="w-5 h-5" /> : <FiArrowRight className="w-5 h-5" />}
          </button>
          <h1 className="text-[15px] font-bold text-gray-900 dark:text-white truncate flex-1">{t('square_page_title')}</h1>
          <SquareFollowButton threadId={thread.id} initialFollowing={thread.isFollowing} />
        </div>
      </div>

      {/* Body */}
      <div
        className="max-w-[640px] mx-auto px-4 py-4 space-y-3"
        style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 9rem)' }}
      >
        <article className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {thread.isPinned && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200">
                <span aria-hidden>📌</span>
                <span>{t('square_pinned_badge')}</span>
              </span>
            )}
            <SquareTypeBadge type={thread.type} />
          </div>
          <h2 className="text-[18px] font-extrabold text-gray-900 dark:text-white leading-snug mb-2">{thread.title}</h2>
          {thread.body && (
            <p className="text-[14.5px] text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
              {thread.body}
            </p>
          )}
          <p className="mt-3 text-[12px] text-gray-500 dark:text-gray-400">
            {lang === 'en' ? `By ${authorName}` : `بقلم ${authorName}`}
          </p>
        </article>

        {/* Replies */}
        <div className="space-y-2">
          {replies.map((r) => <SquareReplyRow key={r.id} reply={r} />)}
          {replies.length === 0 && (
            <p className="text-center text-[13px] text-gray-500 dark:text-gray-400 py-4">
              {lang === 'en' ? 'No replies yet — be the first.' : 'لا توجد ردود بعد — كن أول من يرد.'}
            </p>
          )}
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-2 text-sm text-primary-600 dark:text-primary-300 font-semibold bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 disabled:opacity-50"
            >
              {loadingMore ? '…' : lang === 'en' ? 'Load more replies' : 'المزيد من الردود'}
            </button>
          )}
        </div>
      </div>

      {/* Sticky reply composer — text only. No attach buttons, no
          emoji picker, no clipboard image paste handler. Soft-nudge
          banner appears INLINE above the input when the typed reply
          looks like it belongs elsewhere; hard-blocked content shows
          the same banner red and the API rejects on send. */}
      <form
        onSubmit={sendReply}
        className="fixed inset-x-0 z-10 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700"
        style={{
          bottom: 'calc(var(--hai-safe-bottom, 0px) + 4rem)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="max-w-[640px] mx-auto px-4 py-2.5 space-y-2">
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
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={t('square_reply_placeholder')}
              rows={1}
              maxLength={2200}
              className="flex-1 px-3 py-2.5 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[14px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              style={{ maxHeight: 140 }}
            />
            <button
              type="submit"
              disabled={!replyText.trim() || sending}
              className={`px-4 py-2.5 rounded-2xl text-[14px] font-bold transition-transform active:scale-95 ${
                replyText.trim() && !sending
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }`}
            >
              {sending ? '…' : t('square_reply_send')}
            </button>
          </div>
        </div>
      </form>
    </main>
  )
}

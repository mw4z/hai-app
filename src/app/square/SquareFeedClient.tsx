'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  FiArrowLeft,
  FiArrowRight,
  FiCopy,
  FiCornerUpLeft,
  FiCornerUpRight,
  FiFlag,
  FiX,
} from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { hapticLight } from '@/lib/haptic'
import SquareBubble from '@/components/square/SquareBubble'
import SquareComposer from '@/components/square/SquareComposer'
import ReportUserSheet from '@/components/ReportUserSheet'
import type {
  PublicSquareMessage,
  PublicSquareReplyTo,
} from '@/lib/square/serializeMessage'

interface Props {
  /** First page of messages, oldest→newest (server returns ascending). */
  initialMessages: PublicSquareMessage[]
  /** True if older messages exist beyond the first SSR page. */
  hasMoreOlder: boolean
  neighborhoodName: string
  currentUserId: string
}

/**
 * Square — one shared neighborhood message space. Adopts the DM
 * ChatClient layout patterns (bubble alignment, group rhythm, date
 * dividers, long-press → action menu, sticky composer, keyboard
 * handling) while staying scoped to a single shared room with no
 * threads, no DMs, no media.
 */
export default function SquareFeedClient({
  initialMessages,
  hasMoreOlder: initialHasMore,
  neighborhoodName,
  currentUserId,
}: Props) {
  const { t, lang } = useLanguage()
  const router = useRouter()

  const [messages, setMessages] = useState<PublicSquareMessage[]>(initialMessages)
  const [hasMoreOlder, setHasMoreOlder] = useState(initialHasMore)
  const [loadingOlder, setLoadingOlder] = useState(false)

  /** Long-press selection — the bubble being acted on. Drives both
   *  the chat-bubble-focus dim treatment and the action sheet. */
  const [selectedMsg, setSelectedMsg] = useState<PublicSquareMessage | null>(null)
  /** Staged reply target — non-null while the composer shows the
   *  reply preview bar and the next send will carry replyToMessageId. */
  const [replyingTo, setReplyingTo] = useState<PublicSquareReplyTo | null>(null)
  /** When the user picks "Report" from the action menu, target the
   *  message author for the report sheet. */
  const [reportTargetUserId, setReportTargetUserId] = useState<string | null>(null)

  const listRef = useRef<HTMLDivElement | null>(null)
  const endAnchorRef = useRef<HTMLDivElement | null>(null)
  /** Captured before a "load older" prepend so we can restore scrollTop
   *  to keep the user's anchor row in view after the DOM grows upward. */
  const preserveScrollFromHeight = useRef<number | null>(null)
  /** "Is the viewport near the bottom right now?" Drives whether
   *  incoming messages auto-scroll or just sit silently. */
  const nearBottomRef = useRef<boolean>(true)

  // First paint: snap to the bottom so the newest message is in view.
  useEffect(() => {
    endAnchorRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' })
  }, [])

  // After prepending older messages, restore the scroll position so
  // the user's view stays anchored on the row they were reading.
  useEffect(() => {
    const fromHeight = preserveScrollFromHeight.current
    if (fromHeight == null) return
    const el = listRef.current
    if (!el) return
    const delta = el.scrollHeight - fromHeight
    el.scrollTop = (el.scrollTop || 0) + delta
    preserveScrollFromHeight.current = null
  }, [messages.length])

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMoreOlder || messages.length === 0) return
    setLoadingOlder(true)
    const oldestIso = messages[0].createdAt
    preserveScrollFromHeight.current = listRef.current?.scrollHeight ?? null
    try {
      const res = await fetch(
        `/api/square/messages?before=${encodeURIComponent(oldestIso)}`,
        { cache: 'no-store' },
      )
      const data = await res.json().catch(() => ({}))
      const older: PublicSquareMessage[] = Array.isArray(data?.messages)
        ? data.messages
        : []
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        return [...older.filter((m) => !seen.has(m.id)), ...prev]
      })
      setHasMoreOlder(!!data.hasMore)
    } catch {
      preserveScrollFromHeight.current = null
    } finally {
      setLoadingOlder(false)
    }
  }, [loadingOlder, hasMoreOlder, messages])

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    // Near-bottom: viewport is within 60px of the bottom edge. Drives
    // whether a brand-new incoming message scrolls into view or just
    // appends quietly.
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    nearBottomRef.current = distanceFromBottom < 60
    // Near-top: kick off older-page load.
    if (el.scrollTop < 80 && hasMoreOlder && !loadingOlder) {
      loadOlder()
    }
  }, [hasMoreOlder, loadingOlder, loadOlder])

  function handleSent(msg: PublicSquareMessage) {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
    // Defer scroll-to-bottom one tick so the row mounts first.
    setTimeout(
      () => endAnchorRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }),
      0,
    )
  }

  function handleJumpToReply(targetId: string) {
    const el = document.querySelector<HTMLElement>(`[data-msg-row="${CSS.escape(targetId)}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // Brief flash so the user sees which message we landed on.
    el.classList.add('chat-bubble-focus')
    setTimeout(() => el.classList.remove('chat-bubble-focus'), 1100)
  }

  // ── Long-press action handlers ─────────────────────────────────────
  function handleReply() {
    if (!selectedMsg) return
    setReplyingTo({
      id: selectedMsg.id,
      authorId: selectedMsg.author.id,
      authorName: selectedMsg.author.name,
      authorLastName: selectedMsg.author.lastName,
      body: selectedMsg.body,
      status: selectedMsg.status,
    })
    setSelectedMsg(null)
  }
  async function handleCopy() {
    if (!selectedMsg) return
    try {
      await navigator.clipboard.writeText(selectedMsg.body)
      toast.success(lang === 'en' ? 'Copied' : 'تم النسخ')
    } catch {
      toast.error(lang === 'en' ? 'Copy failed' : 'فشل النسخ')
    }
    setSelectedMsg(null)
  }
  function handleReport() {
    if (!selectedMsg) return
    setReportTargetUserId(selectedMsg.author.id)
    setSelectedMsg(null)
  }

  const empty = messages.length === 0

  // Pre-compute the per-message "is first / last in same-sender group"
  // + "show day-divider above this row" flags ONCE per messages change
  // — same logic ChatClient uses, just inlined into a memo here.
  const decorated = useMemo(() => {
    let lastDay = ''
    return messages.map((msg, idx) => {
      const day = dayKey(msg.createdAt)
      const showDate = day !== lastDay
      if (showDate) lastDay = day
      const prev = messages[idx - 1]
      const next = messages[idx + 1]
      const isFirstInGroup =
        showDate || !prev || prev.author.id !== msg.author.id
      const isLastInGroup = !next || next.author.id !== msg.author.id
      return { msg, isFirstInGroup, isLastInGroup, showDate, dateLabel: dateLabelFor(msg.createdAt, lang) }
    })
  }, [messages, lang])

  return (
    <main className="h-screen h-[100dvh] overflow-hidden bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Cancel the global body padding-top so the header can own the
          notch zone with its own paddingTop. See migration-history note
          in earlier commits — this is the bulletproof header-flush fix. */}
      <style>{`
        body { padding-top: 0 !important; }
      `}</style>

      {/* Header */}
      <div
        className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-[640px] mx-auto px-4 pt-3 pb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-700"
            aria-label={lang === 'en' ? 'Back' : 'رجوع'}
          >
            {lang === 'en' ? <FiArrowLeft className="w-5 h-5" /> : <FiArrowRight className="w-5 h-5" />}
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[17px] font-extrabold text-gray-900 dark:text-white truncate">
              {t('square_page_title')}
            </h1>
            {neighborhoodName && (
              <p className="text-[11.5px] text-gray-500 dark:text-gray-400 truncate">
                {lang === 'en' ? `In ${neighborhoodName}` : `حي ${neighborhoodName}`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Message list */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
        style={{
          paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 12rem)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="max-w-[640px] mx-auto px-3 pt-4">
          {hasMoreOlder && (
            <div className="text-center py-2">
              <button
                type="button"
                onClick={loadOlder}
                disabled={loadingOlder}
                className="text-[12px] font-semibold text-primary-600 dark:text-primary-300 active:scale-95 transition-transform disabled:opacity-50"
              >
                {loadingOlder ? '…' : (lang === 'en' ? 'Load older' : 'تحميل الأقدم')}
              </button>
            </div>
          )}

          {empty ? (
            <div className="text-center py-20">
              <p className="text-5xl mb-3" aria-hidden>🤫</p>
              <p className="text-gray-700 dark:text-gray-200 font-bold text-lg mb-1.5">
                {t('square_empty_quiet_title')}
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed max-w-xs mx-auto">
                {t('square_empty_quiet_body')}
              </p>
            </div>
          ) : (
            decorated.map(({ msg, isFirstInGroup, isLastInGroup, showDate, dateLabel }) => (
              <SquareBubble
                key={msg.id}
                message={msg}
                currentUserId={currentUserId}
                isFirstInGroup={isFirstInGroup}
                isLastInGroup={isLastInGroup}
                showDate={showDate}
                dateLabel={dateLabel}
                selected={selectedMsg?.id === msg.id}
                onLongPress={() => { hapticLight(); setSelectedMsg(msg) }}
                onJumpToReply={handleJumpToReply}
              />
            ))
          )}

          <div ref={endAnchorRef} />
        </div>
      </div>

      <SquareComposer
        currentUserId={currentUserId}
        onSent={handleSent}
        replyingTo={replyingTo}
        setReplyingTo={setReplyingTo}
      />

      {/* Long-press action sheet — Reply / Copy / Report. Same three
          actions DM exposes, minus the destructive / author-only ones
          (edit / delete) that don't make sense for an admin broadcast
          space in MVP. */}
      {selectedMsg && (
        <SquareActionSheet
          isOwn={selectedMsg.author.id === currentUserId}
          onReply={handleReply}
          onCopy={handleCopy}
          onReport={handleReport}
          onClose={() => setSelectedMsg(null)}
        />
      )}

      {/* Report sheet — pre-targeted at the selected message's author. */}
      <ReportUserSheet
        open={!!reportTargetUserId}
        onClose={() => setReportTargetUserId(null)}
        targetUserId={reportTargetUserId ?? ''}
      />
    </main>
  )
}

interface ActionSheetProps {
  isOwn: boolean
  onReply: () => void
  onCopy: () => void
  onReport: () => void
  onClose: () => void
}

/**
 * Bottom action sheet shown when the user long-presses a bubble.
 * Three rows max, large tap targets, dismisses on backdrop tap.
 * Report row is hidden when the user long-pressed their own message
 * (reporting yourself is silly).
 */
function SquareActionSheet({ isOwn, onReply, onCopy, onReport, onClose }: ActionSheetProps) {
  const { lang } = useLanguage()
  return (
    <div
      className="fixed inset-0 z-[1100] bg-black/60 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl pb-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)' }}
      >
        <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto my-2.5" />
        <button
          type="button"
          onClick={onReply}
          className="w-full flex items-center gap-3 px-5 py-3.5 active:bg-gray-50 dark:active:bg-gray-800/60 text-start"
        >
          {lang === 'en' ? (
            <FiCornerUpLeft className="w-5 h-5 text-primary-600" />
          ) : (
            <FiCornerUpRight className="w-5 h-5 text-primary-600" />
          )}
          <span className="text-[15px] font-semibold text-gray-900 dark:text-white">
            {lang === 'en' ? 'Reply' : 'رد'}
          </span>
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="w-full flex items-center gap-3 px-5 py-3.5 active:bg-gray-50 dark:active:bg-gray-800/60 text-start"
        >
          <FiCopy className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          <span className="text-[15px] font-semibold text-gray-900 dark:text-white">
            {lang === 'en' ? 'Copy text' : 'نسخ النص'}
          </span>
        </button>
        {!isOwn && (
          <button
            type="button"
            onClick={onReport}
            className="w-full flex items-center gap-3 px-5 py-3.5 active:bg-gray-50 dark:active:bg-gray-800/60 text-start"
          >
            <FiFlag className="w-5 h-5 text-rose-600" />
            <span className="text-[15px] font-semibold text-rose-600">
              {lang === 'en' ? 'Report' : 'إبلاغ'}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full flex items-center justify-center gap-2 px-5 py-3.5 mt-1 text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800"
        >
          <FiX className="w-4 h-4" />
          <span className="text-[14px] font-medium">
            {lang === 'en' ? 'Cancel' : 'إلغاء'}
          </span>
        </button>
      </div>
    </div>
  )
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function dateLabelFor(iso: string, lang: string): string {
  const then = new Date(iso)
  if (!Number.isFinite(then.getTime())) return ''
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  if (sameDay(then, today)) return lang === 'en' ? 'Today' : 'اليوم'
  if (sameDay(then, yesterday)) return lang === 'en' ? 'Yesterday' : 'أمس'
  try {
    return then.toLocaleDateString(lang === 'en' ? 'en-US' : 'ar-SA', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return ''
  }
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  FiArrowLeft,
  FiArrowRight,
  FiBell,
  FiCopy,
  FiCornerUpLeft,
  FiCornerUpRight,
  FiEdit3,
  FiFlag,
  FiX,
} from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { hapticLight } from '@/lib/haptic'
import SquareBubble from '@/components/square/SquareBubble'
import SquareComposer from '@/components/square/SquareComposer'
import ReportUserSheet from '@/components/ReportUserSheet'
import UserProfileSheet from '@/components/UserProfileSheet'
import { buildConvertToPostHref } from '@/lib/square/convertToPost'
import type {
  PublicSquareMessage,
  PublicSquareReplyTo,
} from '@/lib/square/serializeMessage'

const QUICK_EMOJIS = ['❤️', '👍', '👎', '😂', '😮', '🤲']
/** Same-sender messages within this many ms count as one group (no
 *  repeated sender label, no repeated timestamp). Mirrors the
 *  ~5-minute convention used by WhatsApp / iMessage. */
const GROUP_TIME_GAP_MS = 5 * 60 * 1000

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
  /** When the user taps an avatar or sender name, open the shared
   *  UserProfileSheet for that user. */
  const [profileUserId, setProfileUserId] = useState<string | null>(null)

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
    // Brief glow so the user sees exactly which message we landed on.
    // chat-bubble-highlight (in globals.css) pulses a sky-blue
    // background tint for ~1.4s. We retrigger the class even if the
    // user spam-taps the quote by removing-then-readding it.
    el.classList.remove('chat-bubble-highlight')
    // Force a reflow so the animation restarts.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    el.offsetWidth
    el.classList.add('chat-bubble-highlight')
    setTimeout(() => el.classList.remove('chat-bubble-highlight'), 1500)
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
      type: selectedMsg.type,
      status: selectedMsg.status,
    })
    setSelectedMsg(null)
  }
  async function handleCopy() {
    if (!selectedMsg) return
    try {
      await navigator.clipboard.writeText(selectedMsg.body || '')
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
  function handleConvertToPost() {
    if (!selectedMsg) return
    router.push(buildConvertToPostHref({ body: selectedMsg.body }))
    setSelectedMsg(null)
  }
  async function handleToggleReaction(messageId: string, emoji: string) {
    // Optimistically flip the reaction so the chip lights up
    // instantly; the server response is the truth and replaces our
    // optimistic shape.
    const me = currentUserId
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m
        const mine = m.reactions.find((r) => r.userId === me)
        let next = m.reactions
        if (mine && mine.emoji === emoji) {
          next = m.reactions.filter((r) => r.userId !== me)
        } else if (mine) {
          next = m.reactions.map((r) => (r.userId === me ? { emoji, userId: me } : r))
        } else {
          next = [...m.reactions, { emoji, userId: me }]
        }
        return { ...m, reactions: next }
      }),
    )
    try {
      const res = await fetch(`/api/square/messages/${messageId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      })
      if (!res.ok) {
        toast.error(lang === 'en' ? 'Reaction failed' : 'تعذر إرسال التفاعل')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data?.reactions)) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, reactions: data.reactions } : m)),
        )
      }
    } catch {
      // Optimistic flip already happened; on transient errors the
      // next list refresh will reconcile. No toast spam.
    }
  }
  function handleAvatarTap(userId: string) {
    if (userId && userId !== currentUserId) setProfileUserId(userId)
  }
  async function handleNotifyNeighbors() {
    if (!selectedMsg) return
    const target = selectedMsg
    setSelectedMsg(null)
    try {
      const res = await fetch(`/api/square/messages/${target.id}/notify`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(
          typeof data.error === 'string'
            ? data.error
            : data.error?.message || (lang === 'en' ? 'Could not notify' : 'تعذر إرسال التنبيه'),
        )
        return
      }
      // Optimistically reflect the new notificationFiredAt on the
      // local list so the 🔔 indicator + "already fired" guard
      // surface immediately.
      const firedAt = (data.notificationFiredAt as string) || new Date().toISOString()
      setMessages((prev) =>
        prev.map((m) =>
          m.id === target.id ? { ...m, notificationFiredAt: firedAt } : m,
        ),
      )
      toast.success(lang === 'en' ? 'Neighbors notified' : 'تم تنبيه الجيران')
    } catch {
      toast.error(lang === 'en' ? 'Could not notify' : 'تعذر إرسال التنبيه')
    }
  }

  const empty = messages.length === 0

  // Pre-compute the per-message "is first / last in same-sender group"
  // + "show day-divider" flags. Group break happens when EITHER the
  // sender changes OR the time gap from the previous message exceeds
  // GROUP_TIME_GAP_MS — so a sender's quick run stays one group and
  // their later message (hours apart) starts a new one with its own
  // sender label + timestamp + avatar.
  const decorated = useMemo(() => {
    let lastDay = ''
    return messages.map((msg, idx) => {
      const day = dayKey(msg.createdAt)
      const showDate = day !== lastDay
      if (showDate) lastDay = day
      const prev = messages[idx - 1]
      const next = messages[idx + 1]
      const sameSenderAsPrev =
        prev && prev.author.id === msg.author.id
      const sameSenderAsNext =
        next && next.author.id === msg.author.id
      const closeToPrev =
        prev && (Date.parse(msg.createdAt) - Date.parse(prev.createdAt)) < GROUP_TIME_GAP_MS
      const closeToNext =
        next && (Date.parse(next.createdAt) - Date.parse(msg.createdAt)) < GROUP_TIME_GAP_MS
      const isFirstInGroup = showDate || !sameSenderAsPrev || !closeToPrev
      const isLastInGroup = !sameSenderAsNext || !closeToNext
      return { msg, isFirstInGroup, isLastInGroup, showDate, dateLabel: dateLabelFor(msg.createdAt, lang) }
    })
  }, [messages, lang])

  return (
    <div
      className="flex flex-col bg-gray-100 dark:bg-gray-950"
      // EXACT DM container pattern (see ChatClient.tsx ~line 1424). The
      // chat is anchored to the viewport via position:fixed (top sits
      // BELOW the iOS safe-area so html::before still paints the notch
      // with the same colour as .glass; bottom = 0). Removes the page
      // from the document scroll → iOS WKWebView's rubber-band bounce
      // can only fire INSIDE the messages list (which has its own
      // overscroll-y-contain), not on the header/composer chrome.
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        left: 0,
        right: 0,
        bottom: 0,
        overscrollBehavior: 'none',
        touchAction: 'pan-y',
      }}
    >
      {/* Header — `.glass` is the same class the DM chat header uses,
          which paints the same background as html::before's safe-area
          cover → no colour seam between notch and title strip. */}
      <header className="glass px-4 py-2.5 flex items-center gap-3 z-10 shadow-sm flex-shrink-0">
        <Link href="/feed" className="text-gray-500 dark:text-gray-400 p-1" aria-label={lang === 'en' ? 'Back' : 'رجوع'}>
          {lang !== 'en' ? <FiArrowRight className="w-5 h-5" /> : <FiArrowLeft className="w-5 h-5" />}
        </Link>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-base flex-shrink-0 shadow-sm" aria-hidden>
          🏘️
        </div>
        <div className="min-w-0 text-start flex-1">
          <h1 className="text-[15px] font-semibold text-gray-900 dark:text-white truncate">
            {t('square_page_title')}
          </h1>
          {neighborhoodName && (
            <p className="text-[11px] font-medium text-gray-400 truncate">
              {lang === 'en' ? `In ${neighborhoodName}` : `حي ${neighborhoodName}`}
            </p>
          )}
        </div>
      </header>

      {/* Message list — flex-1, the ONLY scroll surface in the chat
          shell. overscroll-contain so iOS rubber-band stops here and
          doesn't drag the whole chat. */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-y-contain"
        style={{
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
                onAvatarTap={handleAvatarTap}
                onToggleReaction={handleToggleReaction}
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
          myReactionEmoji={
            selectedMsg.reactions.find((r) => r.userId === currentUserId)?.emoji ?? null
          }
          /** Only TEXT messages with non-empty body can be repurposed
           *  into a post. Stickers/voice/PDF/location don't map to a
           *  post body cleanly. */
          canConvertToPost={
            selectedMsg.author.id === currentUserId &&
            selectedMsg.type === 'TEXT' &&
            !!(selectedMsg.body && selectedMsg.body.trim())
          }
          /** "Notify neighbors" is own-message only, and only once per
           *  message (the server also enforces a 24h-per-user rate
           *  limit — we don't surface that here so the user gets a
           *  meaningful toast on the off chance the timer hasn't
           *  elapsed). */
          canNotifyNeighbors={
            selectedMsg.author.id === currentUserId &&
            !selectedMsg.notificationFiredAt &&
            selectedMsg.status === 'ACTIVE'
          }
          onReact={(emoji) => {
            const id = selectedMsg.id
            setSelectedMsg(null)
            handleToggleReaction(id, emoji)
          }}
          onReply={handleReply}
          onCopy={handleCopy}
          onConvertToPost={handleConvertToPost}
          onNotifyNeighbors={handleNotifyNeighbors}
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

      {/* Profile sheet — opens when the user taps an other-user's
          avatar or sender name. The shared sheet handles its own
          fetch + render. */}
      {profileUserId && (
        <UserProfileSheet
          profileUserId={profileUserId}
          currentUserId={currentUserId}
          onClose={() => setProfileUserId(null)}
        />
      )}
    </div>
  )
}

interface ActionSheetProps {
  isOwn: boolean
  myReactionEmoji: string | null
  canConvertToPost: boolean
  canNotifyNeighbors: boolean
  onReact: (emoji: string) => void
  onReply: () => void
  onCopy: () => void
  onConvertToPost: () => void
  onNotifyNeighbors: () => void
  onReport: () => void
  onClose: () => void
}

/**
 * Bottom action sheet shown when the user long-presses a bubble.
 * Quick-emoji row at the top (matches DM), then Reply / Copy /
 * [Convert to post] / [Notify neighbors] / Report.
 */
function SquareActionSheet({
  isOwn,
  myReactionEmoji,
  canConvertToPost,
  canNotifyNeighbors,
  onReact,
  onReply,
  onCopy,
  onConvertToPost,
  onNotifyNeighbors,
  onReport,
  onClose,
}: ActionSheetProps) {
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
        {/* Quick reactions — tap to add / replace / toggle off the
            current user's reaction (server enforces one per user). */}
        <div className="px-4 pt-1 pb-2 flex items-center justify-around">
          {QUICK_EMOJIS.map((emoji) => {
            const mine = myReactionEmoji === emoji
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(emoji)}
                className={`text-[24px] leading-none w-10 h-10 rounded-full flex items-center justify-center transition-transform active:scale-90 ${
                  mine ? 'bg-primary-100 dark:bg-primary-900/40' : ''
                }`}
                aria-label={emoji}
              >
                {emoji}
              </button>
            )
          })}
        </div>
        <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4 mb-1" />
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
        {canConvertToPost && (
          <button
            type="button"
            onClick={onConvertToPost}
            className="w-full flex items-center gap-3 px-5 py-3.5 active:bg-gray-50 dark:active:bg-gray-800/60 text-start"
          >
            <FiEdit3 className="w-5 h-5 text-primary-600" />
            <span className="text-[15px] font-semibold text-gray-900 dark:text-white">
              {lang === 'en' ? 'Convert to a post' : 'حوّلها إلى منشور'}
            </span>
          </button>
        )}
        {canNotifyNeighbors && (
          <button
            type="button"
            onClick={onNotifyNeighbors}
            className="w-full flex items-center gap-3 px-5 py-3.5 active:bg-gray-50 dark:active:bg-gray-800/60 text-start"
          >
            <FiBell className="w-5 h-5 text-amber-500" />
            <span className="flex-1">
              <span className="block text-[15px] font-semibold text-gray-900 dark:text-white">
                {lang === 'en' ? 'Notify neighbors' : 'نبّه الجيران'}
              </span>
              <span className="block text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5">
                {lang === 'en'
                  ? 'One per message · one per 24 hours'
                  : 'مرة لكل رسالة · مرة كل 24 ساعة'}
              </span>
            </span>
          </button>
        )}
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

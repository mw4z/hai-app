'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FiBell, FiCheck, FiCornerUpLeft, FiEdit3, FiEye, FiMapPin } from 'react-icons/fi'
import { ChatPendingClock, ChatSentCheck } from '@/components/chat/MessageStatus'

// Shared per-session "already reported" set so navigating away and
// back doesn't double-POST the same message — mirrors PostCard's
// reportedViews. SquareMessage view rows are also dedup'd server-side
// via the unique (messageId, userId) index, so this is just to avoid
// the unnecessary roundtrip.
const reportedViews = new Set<string>()
import { useLanguage } from '@/hooks/useLanguage'
import { fullName } from '@/lib/displayName'
import SmartTextWithPlacePreviews from '@/components/SmartTextWithPlacePreviews'
import { openExternal } from '@/lib/openExternal'
import VoicePlayer from '@/components/chat/VoicePlayer'
import PdfTile from '@/components/PdfTile'
import Sticker from '@/components/Sticker'
import { parseStickerRef } from '@/lib/stickers/catalog'
import type { PublicSquareMessage, SquareReaction } from '@/lib/square/serializeMessage'
import { useSquareLongPress } from '@/lib/square/useSquareLongPress'
import SquareReplyQuote from './SquareReplyQuote'

interface Props {
  message: PublicSquareMessage
  currentUserId: string
  isFirstInGroup: boolean
  isLastInGroup: boolean
  showDate: boolean
  dateLabel: string
  onLongPress: () => void
  onJumpToReply: (id: string) => void
  /** True when this is the first message after the user's last-seen
   *  boundary — renders a "رسائل جديدة" divider above the bubble,
   *  same look as DM's unread separator. */
  showUnreadDivider?: boolean
  /** Tap an author's avatar/name → open their profile sheet. */
  onAvatarTap: (userId: string) => void
  /** Tap an existing reactions chip → toggle the current user's
   *  reaction with the same emoji (add / remove / replace). */
  onToggleReaction: (messageId: string, emoji: string) => void
  /** Inline "حوّلها لمنشور" chip — own TEXT messages with a body. */
  onMakePost: (message: PublicSquareMessage) => void
  /** Inline "نبّه الحي" chip. For regular residents it only shows
   *  on own messages that haven't been fired on yet (one-shot UX).
   *  For mods the chip stays visible after firing too — they need
   *  the option to broadcast again, and the server lets them
   *  bypass the per-message + 24h gates. */
  onNotify: (message: PublicSquareMessage) => void
  /** True when the viewer is a Square moderator. Controls whether
   *  the notify chip stays visible after a previous fire. */
  isMod?: boolean
  /** Quick-reply arrow on the bubble — stages this message as the
   *  composer's reply target without going through the long-press
   *  action sheet. */
  onQuickReply: (message: PublicSquareMessage) => void
  selected: boolean
}

/**
 * Group chat-style bubble for Square. Mirrors DM's text bubble but
 * adapts for a multi-user shared room:
 *   - Avatar tile for OTHER users, anchored to the LAST bubble in the
 *     same-sender group (the visual convention from iMessage / WhatsApp).
 *   - Sender name above the FIRST bubble in the group (own messages
 *     skip it — the trailing-edge alignment is the cue).
 *   - Timestamp once per group, on the LAST bubble (own + other).
 *   - Reactions chip below the bubble when any reaction exists.
 *   - All five content types render with the existing DM components.
 */
export default function SquareBubble({
  message,
  currentUserId,
  isFirstInGroup,
  isLastInGroup,
  showDate,
  showUnreadDivider = false,
  dateLabel,
  onLongPress,
  onJumpToReply,
  onAvatarTap,
  onToggleReaction,
  onMakePost,
  onNotify,
  onQuickReply,
  isMod = false,
  selected,
}: Props) {
  const { lang } = useLanguage()
  const rowRef = useRef<HTMLDivElement | null>(null)
  const longPress = useSquareLongPress(onLongPress)

  const isMe = message.author.id === currentUserId
  const authorName = isMe
    ? null
    : fullName(message.author) || message.author.name || (lang === 'en' ? 'Neighbor' : 'جار')
  const isVerified = message.author.membership === 'VERIFIED_RESIDENT'

  const timeStr = formatTime(message.createdAt, lang)

  const hasReplyId = !!message.replyToMessageId
  const replyTo = message.replyTo
  const replyUnavailable = hasReplyId && (!replyTo || replyTo.status === 'HIDDEN')

  // Group reactions by emoji + know my own reaction so the chip can
  // light up the one I tapped.
  const reactionsGrouped = useMemo(() => {
    const groups = new Map<string, { count: number; mine: boolean }>()
    for (const r of message.reactions) {
      const cur = groups.get(r.emoji) || { count: 0, mine: false }
      cur.count += 1
      if (r.userId === currentUserId) cur.mine = true
      groups.set(r.emoji, cur)
    }
    return Array.from(groups.entries())
  }, [message.reactions, currentUserId])

  // Live-updated viewer count. Seeded from the server-sent value, then
  // bumped to the server's authoritative number on POST and on the
  // periodic poll while the bubble is on screen.
  const [viewCount, setViewCount] = useState<number>(message.viewCount)
  const [bubbleVisible, setBubbleVisible] = useState(false)

  // First-time visibility → POST a view (server dedups). Also flips
  // `bubbleVisible` so the live-poll effect below knows when to poll
  // and when to pause. Skipped on own messages + DELETED tombstones
  // (server would no-op anyway, but saves the roundtrip).
  useEffect(() => {
    if (isMe) return
    if (message.type === 'DELETED') return
    const el = rowRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        const isVis = entries.some((e) => e.isIntersecting)
        setBubbleVisible(isVis)
        if (isVis && !reportedViews.has(message.id)) {
          reportedViews.add(message.id)
          fetch(`/api/square/messages/${message.id}/view`, { method: 'POST' })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              if (d && typeof d.viewCount === 'number') setViewCount(d.viewCount)
            })
            .catch(() => {})
        }
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [message.id, message.type, isMe])

  // Live count while on-screen: re-fetch every 25s (paused when the
  // tab is hidden) so the number climbs as neighbors view. Polling
  // is gated on isMe because only the sender sees the eye/count
  // chip on their own bubble — no point polling for messages whose
  // count is never rendered.
  useEffect(() => {
    if (!isMe) return
    if (!bubbleVisible) return
    if (message.type === 'DELETED') return
    let cancelled = false
    const poll = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      fetch(`/api/square/messages/${message.id}/view`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d && typeof d.viewCount === 'number') setViewCount(d.viewCount)
        })
        .catch(() => {})
    }
    const id = setInterval(poll, 25_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [isMe, bubbleVisible, message.id, message.type])

  // ── Bubble chrome (rendered INSIDE each per-type bubble) ──────────
  // Sender name at the top: shown for OTHER users on the first
  // bubble of a same-sender group, tapped to open the profile sheet.
  // Time / reply / bell / view count at the bottom: shown on the
  // LAST bubble of a group. Both pieces are kept as variables so the
  // five per-type branches below can drop them in without copying
  // the JSX five times.
  // Role pill — small badge next to the sender name showing whether
  // the author is a neighborhood moderator, platform mod, or super
  // admin. Mirrors the moderation badge already shown elsewhere in
  // the app so users learn the same color language across surfaces.
  const role = message.author.role
  const rolePillCfg = (() => {
    if (role === 'SUPER_ADMIN') return {
      labelAr: 'مشرف عام', labelEn: 'Admin',
      cls: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
    }
    if (role === 'PLATFORM_MOD') return {
      labelAr: 'مشرف', labelEn: 'Mod',
      cls: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800/60',
    }
    if (role === 'NEIGHBORHOOD_MOD') return {
      labelAr: 'مشرف الحي', labelEn: 'Hood Mod',
      cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
    }
    return null
  })()

  const senderHeader = (!isMe && isFirstInGroup) ? (
    <div className="flex items-center gap-1.5 mb-1">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAvatarTap(message.author.id) }}
        className="text-[12.5px] font-bold text-primary-600 dark:text-primary-400 inline-flex items-center gap-1 active:opacity-70 transition-opacity"
      >
        <span className="truncate max-w-[180px]">{authorName}</span>
        {isVerified && (
          <span
            className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300"
            aria-label={lang === 'en' ? 'Verified resident' : 'ساكن مؤكد'}
            title={lang === 'en' ? 'Verified resident' : 'ساكن مؤكد'}
          >
            <FiCheck className="w-2 h-2" strokeWidth={3} />
          </span>
        )}
      </button>
      {rolePillCfg && (
        <span
          className={`inline-flex items-center px-1.5 py-[1px] rounded-full text-[9.5px] font-bold border ${rolePillCfg.cls}`}
        >
          {lang === 'en' ? rolePillCfg.labelEn : rolePillCfg.labelAr}
        </span>
      )}
    </div>
  ) : null

  const footerTone = isMe
    ? 'text-white/65'
    : 'text-gray-500 dark:text-gray-400'

  // Standalone reply arrow, rendered OUTSIDE the bubble — beside it
  // on the side opposite the avatar. Bigger / more obvious than the
  // tiny chevron we used to tuck into the footer line. Always
  // visible (except on DELETED tombstones).
  //
  // Vertically centered next to the bubble regardless of message
  // type. Bottom-aligning (self-end) made the arrow look detached
  // and floating below tall bubbles — the user reported it as
  // "should be in the middle, not down." self-center keeps it
  // anchored to the bubble's vertical midpoint in every case.
  const replyArrowButton = message.type !== 'DELETED' ? (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onQuickReply(message) }}
      aria-label={lang === 'en' ? 'Reply' : 'رد'}
      title={lang === 'en' ? 'Reply' : 'رد'}
      className="flex-shrink-0 self-center inline-flex items-center justify-center w-9 h-9 rounded-full bg-white dark:bg-[var(--bubble-other,#5a6b7e)] border border-gray-200 dark:border-gray-700 text-primary-600 dark:text-primary-400 shadow-sm hover:bg-primary-50 dark:hover:bg-primary-900/30 active:scale-90 transition-all"
    >
      <FiCornerUpLeft className="w-4 h-4" strokeWidth={2.5} />
    </button>
  ) : null
  const metaFooter = isLastInGroup ? (
    <p
      className={`text-[10.5px] mt-1.5 flex w-full items-center gap-1.5 ${footerTone}`}
    >
      {message.notificationFiredAt && (
        <span
          className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full ${
            isMe
              ? 'bg-white/20 text-white'
              : 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
          }`}
          aria-label={lang === 'en' ? 'Notified neighbors' : 'تم تنبيه الجيران'}
          title={lang === 'en' ? 'Notified neighbors' : 'تم تنبيه الجيران'}
        >
          <FiBell className="w-2.5 h-2.5" strokeWidth={3} />
        </span>
      )}
      {/* Views chip stays at the LEADING edge alongside the bell. */}
      {isMe && message.type !== 'DELETED' && (
        <span
          className="inline-flex items-center gap-0.5 opacity-80"
          aria-label={lang === 'en' ? `${viewCount} views` : `${viewCount} مشاهدة`}
          title={lang === 'en' ? `${viewCount} views` : `${viewCount} مشاهدة`}
        >
          <FiEye className="w-2.5 h-2.5" />
          <span>{viewCount}</span>
        </span>
      )}
      {/* Time + sending-status share the TRAILING corner — same
          cluster WhatsApp uses (HH:MM ✓✓ in the bottom-right of
          own bubbles). ms-auto pushes the whole cluster to the
          end of the full-width meta row. */}
      <span className="ms-auto inline-flex items-center gap-1">
        <span>{timeStr}</span>
        {isMe && message.type !== 'DELETED' && (
          message.id.startsWith('pending-') ? <ChatPendingClock /> : <ChatSentCheck />
        )}
      </span>
    </p>
  ) : null

  return (
    <div
      ref={rowRef}
      data-msg-row={message.id}
      className={`chat-bubble-in ${selected ? 'chat-bubble-focus' : ''}`}
    >
      {showDate && (
        <div className="flex items-center justify-center my-4">
          <span className="text-[11px] text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-3 py-1 rounded-full shadow-sm font-medium">
            {dateLabel}
          </span>
        </div>
      )}

      {/* Unread divider — same shape DM uses. Rendered above the
          first message authored AFTER the viewer's last-seen
          boundary captured on mount. */}
      {showUnreadDivider && (
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-primary-400/50" />
          <span className="text-[11px] text-primary-600 dark:text-primary-400 font-semibold px-2">
            {lang === 'en' ? 'New messages' : 'رسائل جديدة'}
          </span>
          <div className="flex-1 h-px bg-primary-400/50" />
        </div>
      )}

      {/* Outermost wrapper PLACES the chat-row on the correct screen
          side via justify-content — direction-aware so own goes RIGHT
          in both LTR and RTL, other goes LEFT in both. The inner row
          is content-sized (max-w 85%) so it actually clusters at the
          justified edge instead of spanning the full width. */}
      <div
        className={`flex w-full ${
          isLastInGroup ? 'mb-2' : 'mb-[3px]'
        } ${isFirstInGroup && !showDate ? 'mt-3' : ''} ${
          // Pure justify-end/start so the bubble flips with the
          // writing direction:
          //   LTR own → right, other → left
          //   RTL own → LEFT,  other → right
          // (Previously rtl: overrides forced own to stay on the
          //  right even in Arabic — the user asked to flip it.)
          isMe ? 'justify-end' : 'justify-start'
        }`}
      >
        {/* Inner chat-row: avatar + bubble column. NO flex-row-reverse
            anymore — Arabic now flips own to the LEFT visually
            (per user request), so DOM order [arrow][bubble][avatar]
            for own and [avatar][bubble][arrow] for other naturally
            puts the avatar on the bubble's outer edge in BOTH
            directions via RTL's intrinsic visual flip. */}
        <div className="flex items-end gap-2 max-w-[85%]">
          {/* Avatar slot — placed in the DOM at the "outer edge" of
              the row. For OTHER it sits at DOM position 0 (renders
              on the row's LEFT). For OWN it sits AFTER the column
              (renders on the row's RIGHT) — see the matching slot
              below the column. */}
          {!isMe && (
            <AvatarTile
              authorId={message.author.id}
              avatarUrl={message.author.avatarUrl}
              name={message.author.name}
              isLastInGroup={isLastInGroup}
              onAvatarTap={onAvatarTap}
              lang={lang}
            />
          )}
          {/* Reply arrow for OWN messages — sits BEFORE the bubble
              column in the DOM. In LTR that's the LEFT of the
              bubble (avatar on the right); in RTL the natural
              direction flip puts it on the RIGHT of the bubble
              (avatar on the left). Always opposite the avatar. */}
          {isMe && replyArrowButton}

          {/* Bubble column. Content-sized (no flex-1, no min-w-0 —
              min-w-0 was letting break-words shred single Arabic
              words like "تجربة" into one-char-per-line slivers).
              Children align to the bubble's anchor side using the
              same DM ltr:/rtl: pattern. */}
          <div
            className={`flex flex-col ${
              // Children align to the "end" side for own bubbles in
              // BOTH directions (end = right in LTR, end = left in
              // RTL — both correct now that Arabic own sits on the
              // LEFT). Previously rtl: forced own to items-start
              // (RTL = right side) so the bubble stayed pinned to
              // the right of the screen even in Arabic.
              isMe ? 'items-end' : 'items-start'
            }`}
          >
          {/* No max-w here — the OUTER row already caps the bubble at
              max-w-[85%] of the screen. A percentage max-w on this
              wrapper would resolve against the content-sized column
              (no definite width → effectively 0), which collapsed the
              bubble to its min-content width — break-words then
              shredded short Arabic words like "تجربة" character-by-
              character. */}
          <div data-msg-id={message.id} {...longPress}>
            {(replyTo || replyUnavailable) && (
              <SquareReplyQuote
                reply={
                  replyTo ?? {
                    id: message.replyToMessageId!,
                    authorId: '',
                    authorName: null,
                    authorLastName: null,
                    body: '',
                    type: 'TEXT',
                    status: 'HIDDEN',
                  }
                }
                isMe={isMe}
                isOwnQuote={!!replyTo && replyTo.authorId === currentUserId}
                unavailable={replyUnavailable}
                onClick={
                  replyTo && !replyUnavailable
                    ? () => onJumpToReply(replyTo.id)
                    : undefined
                }
              />
            )}

            {message.type === 'DELETED' ? (
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 border border-dashed ${
                  isMe
                    ? `bg-primary-600/30 border-primary-400/40 ${
                        isLastInGroup ? 'ltr:rounded-br-sm rtl:rounded-bl-sm' : ''
                      }`
                    : `bg-white/30 dark:bg-[var(--bubble-other,#5a6b7e)]/60 border-gray-300/40 dark:border-gray-600/30 ${
                        isLastInGroup ? 'ltr:rounded-bl-sm rtl:rounded-br-sm' : ''
                      }`
                }`}
              >
                {senderHeader}
                <p
                  className={`text-[13.5px] italic ${
                    isMe
                      ? 'text-primary-100'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  🚫 {isMe
                    ? (lang === 'en' ? 'You deleted this message' : 'حذفت هذه الرسالة')
                    : (lang === 'en' ? 'This message was deleted' : 'تم حذف هذه الرسالة')}
                </p>
                {metaFooter}
              </div>
            ) : message.type === 'STICKER' ? (() => {
              const stickerId = parseStickerRef(message.imageUrl || '')
              if (!stickerId) return null
              // Stickers are transparent floating art, not a bubble —
              // wrap them in a minimal container so we still get the
              // sender name above and the time/reply/views below.
              return (
                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {senderHeader}
                  <Sticker id={stickerId} size={120} />
                  {metaFooter}
                </div>
              )
            })() : message.type === 'VOICE' && message.audioUrl ? (
              <div
                className={`relative rounded-2xl px-4 py-3 shadow-md ${
                  isMe
                    ? `bg-primary-600 ${
                        isLastInGroup ? 'ltr:rounded-br-sm rtl:rounded-bl-sm' : ''
                      }`
                    : `bg-white dark:bg-[var(--bubble-other,#5a6b7e)] dark:ring-1 dark:ring-white/[0.08] ${
                        isLastInGroup ? 'ltr:rounded-bl-sm rtl:rounded-br-sm' : ''
                      }`
                }`}
              >
                {senderHeader}
                <VoicePlayer
                  src={message.audioUrl}
                  durationMs={message.audioDurationMs ?? undefined}
                  isMe={isMe}
                />
                {metaFooter}
              </div>
            ) : message.type === 'PDF' && message.pdfUrl ? (
              <div
                className={`relative rounded-2xl px-4 py-3 shadow-md ${
                  isMe
                    ? `bg-primary-600 ${
                        isLastInGroup ? 'ltr:rounded-br-sm rtl:rounded-bl-sm' : ''
                      }`
                    : `bg-white dark:bg-[var(--bubble-other,#5a6b7e)] dark:ring-1 dark:ring-white/[0.08] ${
                        isLastInGroup ? 'ltr:rounded-bl-sm rtl:rounded-br-sm' : ''
                      }`
                }`}
              >
                {senderHeader}
                <PdfTile
                  url={message.pdfUrl}
                  name={message.pdfName}
                  variant="message"
                  tone={isMe ? 'onPrimary' : 'onSurface'}
                />
                {message.body && (
                  <p
                    className={`mt-2 text-[14px] leading-relaxed whitespace-pre-wrap break-words ${
                      isMe ? 'text-white' : 'text-gray-800 dark:text-gray-100'
                    }`}
                  >
                    {message.body}
                  </p>
                )}
                {metaFooter}
              </div>
            ) : message.type === 'LOCATION' && message.lat != null && message.lng != null ? (
              <div
                className={`relative rounded-2xl px-4 py-3 shadow-md ${
                  isMe
                    ? `bg-primary-600 text-white ${
                        isLastInGroup ? 'ltr:rounded-br-sm rtl:rounded-bl-sm' : ''
                      }`
                    : `bg-white dark:bg-[var(--bubble-other,#5a6b7e)] dark:ring-1 dark:ring-white/[0.08] text-gray-800 dark:text-gray-100 ${
                        isLastInGroup ? 'ltr:rounded-bl-sm rtl:rounded-br-sm' : ''
                      }`
                }`}
              >
                {senderHeader}
                <div className={`flex items-center gap-1.5 mb-1 ${isMe ? 'text-primary-100' : 'text-primary-600 dark:text-primary-400'}`}>
                  <FiMapPin className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">
                    {lang === 'en' ? 'Location' : 'موقع'}
                  </span>
                </div>
                <a
                  href={`https://maps.google.com/?q=${message.lat},${message.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    // Don't let the Android WebView try to "navigate"
                    // to maps.google.com (shows "page not available").
                    // openExternal() hands off to a Custom Tab, which
                    // Android resolves to the Google Maps app via
                    // App Links.
                    e.stopPropagation()
                    e.preventDefault()
                    openExternal(`https://maps.google.com/?q=${message.lat},${message.lng}`)
                  }}
                  className={`block rounded-xl overflow-hidden mb-1 p-2.5 text-center ${
                    isMe ? 'bg-primary-700/50' : 'bg-gray-100 dark:bg-gray-700'
                  }`}
                >
                  <span className="text-2xl">📍</span>
                  <p className={`text-xs mt-1 font-medium ${isMe ? 'text-primary-100' : 'text-primary-600 dark:text-primary-400'}`}>
                    {lang === 'en' ? 'Open in Maps ↗' : 'افتح في الخريطة ↗'}
                  </p>
                </a>
                {message.body && (
                  <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words mt-1">
                    {message.body}
                  </p>
                )}
                {metaFooter}
              </div>
            ) : (
              <div
                className={`relative rounded-2xl px-4 py-3 shadow-md ${
                  isMe
                    ? `bg-primary-600 text-white ${
                        isLastInGroup ? 'ltr:rounded-br-sm rtl:rounded-bl-sm' : ''
                      }`
                    : `bg-white dark:bg-[var(--bubble-other,#5a6b7e)] dark:ring-1 dark:ring-white/[0.08] text-gray-800 dark:text-gray-100 ${
                        isLastInGroup ? 'ltr:rounded-bl-sm rtl:rounded-br-sm' : ''
                      }`
                }`}
              >
                {senderHeader}
                <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                  <SmartTextWithPlacePreviews
                    text={message.body || ''}
                    variant={isMe ? 'onGreen' : 'light'}
                  />
                </div>
                {metaFooter}
              </div>
            )}
          </div>

          {/* Inline quick-action chips — own messages only, last in
              group, not a tombstone. The same two actions that live
              in the long-press sheet are surfaced HERE because most
              users won't discover the long-press gesture. Shown on
              the trailing edge (next to the message) so they read
              as "extra things I can do with what I just sent". */}
          {isMe && isLastInGroup && message.type !== 'DELETED' && (
            <div className="mt-1 inline-flex items-center gap-1.5 flex-wrap">
              {message.type === 'TEXT' && message.body && message.body.trim() && (
                <button
                  type="button"
                  onClick={() => onMakePost(message)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-bold bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800/60 active:scale-95 transition-transform"
                >
                  <FiEdit3 className="w-3 h-3" />
                  <span>{lang === 'en' ? 'Make a post' : 'حوّلها لمنشور'}</span>
                </button>
              )}
              {/* Notify chip:
                  - Residents: shown until the message has been fired
                    on (one-shot UX, matches the per-message lock).
                  - Mods: ALWAYS shown — they can re-broadcast a
                    message if more eyes are needed. Server-side
                    bypass for the per-message + 24h rate gates
                    lives in /api/square/messages/[id]/notify. */}
              {message.status === 'ACTIVE'
                && (isMod || !message.notificationFiredAt) && (
                <button
                  type="button"
                  onClick={() => onNotify(message)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 active:scale-95 transition-transform"
                >
                  <FiBell className="w-3 h-3" />
                  <span>{lang === 'en' ? 'Broadcast' : 'نبّه الحي'}</span>
                </button>
              )}
            </div>
          )}

          {/* Reactions chip — same look as DM's grouped bubble. Tap
              an emoji you've already reacted with to remove it; tap
              a different one to replace yours. */}
          {reactionsGrouped.length > 0 && (
            <div
              className={`mt-0.5 inline-flex items-center gap-0.5 bg-white dark:bg-gray-800 rounded-full shadow-md border border-gray-200 dark:border-gray-600 px-1.5 py-0.5`}
            >
              {reactionsGrouped.map(([emoji, { count, mine }]) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleReaction(message.id, emoji)
                  }}
                  className={`inline-flex items-center gap-0.5 text-[13px] leading-none px-1 py-0.5 rounded-full ${
                    mine ? 'bg-primary-50 dark:bg-primary-900/40' : ''
                  }`}
                >
                  <span>{emoji}</span>
                  {count > 1 && (
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Outside timestamp row removed — metaFooter (time / reply
              arrow / bell / view count) is now rendered INSIDE each
              per-type bubble above. */}
        </div>

        {/* Reply arrow for OTHER messages — sits AFTER the bubble
            column. In LTR this lands on the bubble's RIGHT (opposite
            the avatar on the left); in RTL with flex-row-reverse it
            visually lands on the LEFT (opposite the avatar on the
            right). Either way it's on the trailing/outer edge. */}
        {!isMe && replyArrowButton}
        {/* Own avatar — matches the other-user slot but rendered AFTER
            the bubble column so it lands on the row's outer edge
            (right of own bubble in both LTR and RTL). Same isLastInGroup
            spacer rules so a run of own messages doesn't repeat the
            avatar five times. */}
        {isMe && (
          <AvatarTile
            authorId={message.author.id}
            avatarUrl={message.author.avatarUrl}
            name={message.author.name}
            isLastInGroup={isLastInGroup}
            onAvatarTap={onAvatarTap}
            lang={lang}
          />
        )}
        </div>
      </div>
    </div>
  )
}

interface AvatarTileProps {
  authorId: string
  avatarUrl: string | null
  name: string | null
  isLastInGroup: boolean
  onAvatarTap: (userId: string) => void
  lang: string
}

/** Reusable avatar tile — circular profile picture (or gradient + initial
 *  fallback) anchored to the bottom of the bubble column via the parent
 *  row's `items-end`. Only renders on the LAST bubble in a same-sender
 *  group; intermediate rows get a spacer so the column inset stays
 *  consistent across the whole group. */
function AvatarTile({
  authorId,
  avatarUrl,
  name,
  isLastInGroup,
  onAvatarTap,
  lang,
}: AvatarTileProps) {
  return (
    <div className="w-7 shrink-0 flex justify-center">
      {isLastInGroup ? (
        <button
          type="button"
          onClick={() => onAvatarTap(authorId)}
          aria-label={lang === 'en' ? 'Open profile' : 'فتح الملف'}
          className="active:scale-95 transition-transform"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="w-7 h-7 rounded-full object-cover shadow-sm"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
              {(name || '؟').slice(0, 1)}
            </div>
          )}
        </button>
      ) : (
        <span aria-hidden className="w-7 h-1" />
      )}
    </div>
  )
}

function formatTime(iso: string, lang: string): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  try {
    return new Date(then).toLocaleTimeString(
      lang === 'en' ? 'en-US' : 'ar-SA',
      { hour: 'numeric', minute: '2-digit' },
    )
  } catch {
    return ''
  }
}

'use client'

import { useMemo, useRef } from 'react'
import { FiBell, FiCheck, FiMapPin } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { fullName } from '@/lib/displayName'
import SmartTextWithPlacePreviews from '@/components/SmartTextWithPlacePreviews'
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
  /** Tap an author's avatar/name → open their profile sheet. */
  onAvatarTap: (userId: string) => void
  /** Tap an existing reactions chip → toggle the current user's
   *  reaction with the same emoji (add / remove / replace). */
  onToggleReaction: (messageId: string, emoji: string) => void
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
  dateLabel,
  onLongPress,
  onJumpToReply,
  onAvatarTap,
  onToggleReaction,
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
  const showSenderLabel = !isMe && isFirstInGroup

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

      {/* Outer row — horizontal flex so the avatar can sit beside the
          bubble column. `items-end` aligns the avatar with the last
          bubble. Document-order flex puts the avatar on the leading
          edge in both LTR and RTL (RTL flips the physical direction
          automatically), so no `flex-row-reverse` needed. */}
      <div
        className={`flex items-end gap-2 ${
          isLastInGroup ? 'mb-2' : 'mb-[3px]'
        } ${isFirstInGroup && !showDate ? 'mt-3' : ''}`}
      >
        {!isMe && (
          <div className="w-7 shrink-0 flex justify-center">
            {isLastInGroup ? (
              <button
                type="button"
                onClick={() => onAvatarTap(message.author.id)}
                aria-label={lang === 'en' ? 'Open profile' : 'فتح الملف'}
                className="active:scale-95 transition-transform"
              >
                {message.author.avatarUrl ? (
                  <img
                    src={message.author.avatarUrl}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover shadow-sm"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                    {(message.author.name || '؟').slice(0, 1)}
                  </div>
                )}
              </button>
            ) : (
              // Spacer keeps the bubble column at a consistent inset
              // for every row in the group, even when the avatar
              // isn't drawn here.
              <span aria-hidden className="w-7 h-1" />
            )}
          </div>
        )}

        {/* Bubble column. items-end / items-start handles the
            within-column alignment of the sender label, bubble,
            reactions chip and timestamp. */}
        <div
          className={`flex flex-col min-w-0 max-w-[85%] ${
            isMe ? 'items-end' : 'items-start'
          }`}
        >
          {showSenderLabel && (
            <button
              type="button"
              onClick={() => onAvatarTap(message.author.id)}
              className="px-1 mb-0.5 text-[11px] font-bold text-primary-600 dark:text-primary-400 inline-flex items-center gap-1 active:opacity-70 transition-opacity"
            >
              <span className="truncate max-w-[200px]">{authorName}</span>
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
          )}

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
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 border border-dashed ${
                  isMe
                    ? `bg-primary-600/30 border-primary-400/40 ${
                        isLastInGroup ? 'ltr:rounded-br-sm rtl:rounded-bl-sm' : ''
                      }`
                    : `bg-white/30 dark:bg-[#242625]/60 border-gray-300/40 dark:border-gray-600/30 ${
                        isLastInGroup ? 'ltr:rounded-bl-sm rtl:rounded-br-sm' : ''
                      }`
                }`}
              >
                <p
                  className={`text-[13px] italic ${
                    isMe
                      ? 'text-primary-100'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  🚫 {isMe
                    ? (lang === 'en' ? 'You deleted this message' : 'حذفت هذه الرسالة')
                    : (lang === 'en' ? 'This message was deleted' : 'تم حذف هذه الرسالة')}
                </p>
              </div>
            ) : message.type === 'STICKER' ? (() => {
              const stickerId = parseStickerRef(message.imageUrl || '')
              if (!stickerId) return null
              return <Sticker id={stickerId} size={120} />
            })() : message.type === 'VOICE' && message.audioUrl ? (
              <div
                className={`relative rounded-2xl px-3 py-2.5 shadow-sm ${
                  isMe
                    ? `bg-primary-600 ${
                        isLastInGroup ? 'ltr:rounded-br-sm rtl:rounded-bl-sm' : ''
                      }`
                    : `bg-white dark:bg-[#242625] ${
                        isLastInGroup ? 'ltr:rounded-bl-sm rtl:rounded-br-sm' : ''
                      }`
                }`}
              >
                <VoicePlayer
                  src={message.audioUrl}
                  durationMs={message.audioDurationMs ?? undefined}
                  isMe={isMe}
                />
              </div>
            ) : message.type === 'PDF' && message.pdfUrl ? (
              <div
                className={`relative rounded-2xl px-2.5 py-2 shadow-sm ${
                  isMe
                    ? `bg-primary-600 ${
                        isLastInGroup ? 'ltr:rounded-br-sm rtl:rounded-bl-sm' : ''
                      }`
                    : `bg-white dark:bg-[#242625] ${
                        isLastInGroup ? 'ltr:rounded-bl-sm rtl:rounded-br-sm' : ''
                      }`
                }`}
              >
                <PdfTile
                  url={message.pdfUrl}
                  name={message.pdfName}
                  variant="message"
                  tone={isMe ? 'onPrimary' : 'onSurface'}
                />
                {message.body && (
                  <p
                    className={`mt-1.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words ${
                      isMe ? 'text-white' : 'text-gray-800 dark:text-gray-100'
                    }`}
                  >
                    {message.body}
                  </p>
                )}
              </div>
            ) : message.type === 'LOCATION' && message.lat != null && message.lng != null ? (
              <div
                className={`relative rounded-2xl px-3.5 py-2.5 shadow-sm ${
                  isMe
                    ? `bg-primary-600 text-white ${
                        isLastInGroup ? 'ltr:rounded-br-sm rtl:rounded-bl-sm' : ''
                      }`
                    : `bg-white dark:bg-[#242625] text-gray-800 dark:text-gray-100 ${
                        isLastInGroup ? 'ltr:rounded-bl-sm rtl:rounded-br-sm' : ''
                      }`
                }`}
              >
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
                  onClick={(e) => e.stopPropagation()}
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
                  <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words mt-1">
                    {message.body}
                  </p>
                )}
              </div>
            ) : (
              <div
                className={`relative rounded-2xl px-3 py-2 shadow-sm ${
                  isMe
                    ? `bg-primary-600 text-white ${
                        isLastInGroup ? 'ltr:rounded-br-sm rtl:rounded-bl-sm' : ''
                      }`
                    : `bg-white dark:bg-[#242625] text-gray-800 dark:text-gray-100 ${
                        isLastInGroup ? 'ltr:rounded-bl-sm rtl:rounded-br-sm' : ''
                      }`
                }`}
              >
                <div className="text-[14.5px] leading-relaxed whitespace-pre-wrap break-words">
                  <SmartTextWithPlacePreviews
                    text={message.body || ''}
                    variant={isMe ? 'onGreen' : 'light'}
                  />
                </div>
              </div>
            )}
          </div>

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

          {/* Timestamp — ONLY on the last bubble in a same-sender group
              so a run of quick messages doesn't repeat the same time
              under each one. The 🔔 indicator rides along the same
              row when notify-neighbors fired. */}
          {isLastInGroup && (
            <p
              className={`text-[10px] mt-1 px-1 text-gray-400 inline-flex items-center gap-1 ${
                isMe ? 'ltr:text-start rtl:text-end' : 'ltr:text-end rtl:text-start'
              }`}
            >
              {message.notificationFiredAt && (
                <span
                  className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full ${
                    isMe
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                  }`}
                  aria-label={lang === 'en' ? 'Notified neighbors' : 'تم تنبيه الجيران'}
                  title={lang === 'en' ? 'Notified neighbors' : 'تم تنبيه الجيران'}
                >
                  <FiBell className="w-2.5 h-2.5" strokeWidth={3} />
                </span>
              )}
              <span>{timeStr}</span>
            </p>
          )}
        </div>
      </div>
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

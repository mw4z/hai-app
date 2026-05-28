'use client'

import { useRef } from 'react'
import { FiCheck, FiMapPin } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { fullName } from '@/lib/displayName'
import SmartTextWithPlacePreviews from '@/components/SmartTextWithPlacePreviews'
import VoicePlayer from '@/components/chat/VoicePlayer'
import PdfTile from '@/components/PdfTile'
import Sticker from '@/components/Sticker'
import { parseStickerRef } from '@/lib/stickers/catalog'
import type { PublicSquareMessage } from '@/lib/square/serializeMessage'
import { useSquareLongPress } from '@/lib/square/useSquareLongPress'
import SquareReplyQuote from './SquareReplyQuote'

interface Props {
  message: PublicSquareMessage
  currentUserId: string
  /** True when this message and the previous one share an author (and
   *  no day-divider sits between them). Drives the "no sender label /
   *  tight spacing" group rhythm copied from DM. */
  isFirstInGroup: boolean
  isLastInGroup: boolean
  /** Show the "Wed, Aug 14" pill above this bubble. */
  showDate: boolean
  dateLabel: string
  /** Long-press → opens the bubble action menu (reply / copy / report). */
  onLongPress: () => void
  /** Tap the quoted reply → scroll + flash the original message in the list. */
  onJumpToReply: (id: string) => void
  /** Whether this bubble is currently selected (long-press target).
   *  Drives the chat-bubble-focus dim treatment + scale. */
  selected: boolean
}

/**
 * Single Square message bubble. Pattern is copied bone-for-bone from
 * the DM ChatClient text bubble — alignment, colors, group rhythm,
 * timestamp row, reply quote — so the two screens feel like the same
 * surface in different scopes.
 *
 * Square-specific:
 *   - No image/PDF/voice/location branches; this is the text-only case.
 *   - No read receipts (no MsgStatus ticks). Broadcast room → who would
 *     they be from?
 *   - Sender label above first-in-group bubbles for OTHER users (+ a
 *     tiny ✓ when verified). My own messages don't carry a label.
 *   - SmartTextWithPlacePreviews renders /directory/<id> links as
 *     preview cards (the only "attachment" surface Square allows).
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

  // Sender label only appears above the FIRST bubble in a same-sender
  // run, and only for other users. My own messages don't repeat my
  // name. Verified residents get a tiny ✓ next to the name; full
  // membership pills are intentionally deferred to Phase 2 to keep
  // the chat stream uncluttered.
  const showSenderLabel = !isMe && isFirstInGroup

  const timeStr = formatTime(message.createdAt, lang)

  // Reply quote shape: prefer the nested replyTo. If it's missing
  // (parent hard-deleted) but the column is set, the parent is gone
  // → show "Message unavailable" preview using the bare id.
  const hasReplyId = !!message.replyToMessageId
  const replyTo = message.replyTo
  const replyUnavailable = hasReplyId && (!replyTo || replyTo.status === 'HIDDEN')

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

      <div
        // Force WhatsApp-style alignment regardless of page direction
        // — exactly like ChatClient does. items-end in rtl flips to
        // the wrong edge otherwise.
        className={`flex flex-col ${
          isMe ? 'ltr:items-end rtl:items-start' : 'ltr:items-start rtl:items-end'
        } ${isLastInGroup ? 'mb-2' : 'mb-[3px]'} ${
          isFirstInGroup && !showDate ? 'mt-3' : ''
        }`}
      >
        {showSenderLabel && (
          <p className="px-3 mb-0.5 text-[11px] font-bold text-primary-600 dark:text-primary-400 inline-flex items-center gap-1">
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
          </p>
        )}

        <div className="max-w-[85%]" data-msg-id={message.id} {...longPress}>
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

          {/* Per-type bubble rendering — same shapes DM uses. STICKER
              renders without a chrome bubble shell (just the sticker
              floating on the chat background) which matches DM behavior. */}
          {message.type === 'STICKER' ? (() => {
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

        <p
          className={`text-[10px] mt-1 px-1 text-gray-400 ${
            isMe ? 'ltr:text-start rtl:text-end' : 'ltr:text-end rtl:text-start'
          }`}
        >
          {timeStr}
        </p>
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

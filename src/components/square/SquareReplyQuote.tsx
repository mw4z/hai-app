'use client'

import { useLanguage } from '@/hooks/useLanguage'
import { fullName } from '@/lib/displayName'
import type { PublicSquareReplyTo } from '@/lib/square/serializeMessage'

interface Props {
  reply: PublicSquareReplyTo
  /** True when the quote is rendered INSIDE my own bubble (bg-primary-600).
   *  Tones the colors so the inner-bubble version stays readable. */
  isMe?: boolean
  /** True when the viewer authored the quoted parent (rare-but-real:
   *  someone replied to my message, or I'm replying to my own). */
  isOwnQuote?: boolean
  /** When the quoted message was hard-deleted or hidden, the API
   *  surfaces it as status==='HIDDEN' (or no replyTo at all). The
   *  rendering swap lives in the parent; this prop just lets the
   *  unavailable variant share the same layout. */
  unavailable?: boolean
  /** Tap handler — same UX as DM: tapping the quote scrolls/flashes
   *  the original message. Wired by the bubble parent. */
  onClick?: () => void
}

/**
 * The quoted-message bar. Two surfaces use it:
 *   - the composer's "replying to ..." preview (the user is staging
 *     a reply; <X> button to cancel lives next to it in the composer)
 *   - inside a sent bubble's body, above the new text
 *
 * Visual mirrors the DM ChatClient reply quote — border-start accent,
 * small bold name line, single-line body preview.
 */
export default function SquareReplyQuote({
  reply,
  isMe = false,
  isOwnQuote = false,
  unavailable = false,
  onClick,
}: Props) {
  const { lang } = useLanguage()

  const authorLabel = isOwnQuote
    ? (lang === 'en' ? 'You' : lang === 'ur' ? 'آپ' : 'أنت')
    : fullName({ name: reply.authorName, lastName: reply.authorLastName }) ||
      reply.authorName ||
      (lang === 'en' ? 'Neighbor' : 'جار')

  // Per-type preview — mirrors DM's reply quote ("🎤" / "📄 PDF" /
  // "📍" / "🖼️ ملصق") so the user sees what shape of content they're
  // replying to even when the parent has no text body.
  let preview: string
  if (unavailable || reply.status === 'HIDDEN') {
    preview = lang === 'en' ? 'Message unavailable' : 'رسالة غير متاحة'
  } else if (reply.type === 'VOICE') {
    preview = '🎤'
  } else if (reply.type === 'PDF') {
    preview = '📄 PDF'
  } else if (reply.type === 'LOCATION') {
    preview = '📍'
  } else if (reply.type === 'STICKER') {
    preview = lang === 'en' ? '🖼️ Sticker' : '🖼️ ملصق'
  } else if (reply.type === 'DELETED') {
    preview = lang === 'en' ? '🚫 Deleted' : '🚫 رسالة محذوفة'
  } else {
    preview = (reply.body || '').slice(0, 80)
  }

  const Tag = onClick ? 'button' : 'div'
  const tagProps = onClick
    ? { type: 'button' as const, onClick: (e: React.MouseEvent) => { e.stopPropagation(); onClick() } }
    : {}

  return (
    <Tag
      {...tagProps}
      className={`mb-1 w-full text-start px-2.5 py-1.5 rounded-lg border-s-2 ${
        onClick ? 'active:opacity-70 transition-opacity' : ''
      } ${
        isMe
          ? 'bg-primary-700/40 border-white/40'
          : 'bg-gray-100 dark:bg-white/10 border-primary-500'
      }`}
    >
      <p
        className={`text-[10px] font-bold ${
          isMe ? 'text-primary-100' : 'text-primary-600 dark:text-primary-400'
        }`}
      >
        {authorLabel}
      </p>
      <p
        className={`text-[11px] truncate ${
          isMe ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        {preview}
      </p>
    </Tag>
  )
}

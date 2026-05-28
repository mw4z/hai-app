'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FiAlertCircle, FiPaperclip, FiSend, FiX } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { hapticLight } from '@/lib/haptic'
import { detectSquareIntent } from '@/lib/square/detectIntent'
import { fullName } from '@/lib/displayName'
import PlacePickerSheet from '@/components/places/PlacePickerSheet'
import { formatContactSnippet } from '@/lib/contactPicker'
import type {
  PublicSquareMessage,
  PublicSquareReplyTo,
} from '@/lib/square/serializeMessage'

interface Props {
  currentUserId: string
  /** Fires after a successful send so the parent can append + auto-scroll. */
  onSent: (message: PublicSquareMessage) => void
  /** Reply target (staging) — when non-null, a preview bar appears
   *  above the input. Send POSTS with replyToMessageId set; on
   *  success the parent clears this. */
  replyingTo: PublicSquareReplyTo | null
  setReplyingTo: (r: PublicSquareReplyTo | null) => void
}

/**
 * Square composer — adopts the DM `glass-bottom` composer exactly:
 * normal flex child of the chat container (NOT fixed), reply preview
 * bar above the input, single-line input + circular send. Because the
 * Square page now uses the same `position: fixed; top: safe-area-top;
 * bottom: 0` shell as DM AND the BottomNav is hidden on /square, the
 * composer rides up with the visual viewport when the iOS keyboard
 * opens — no extra positioning logic, no body-class hack, no nav to
 * fight. Identical to WhatsApp/DM keyboard handling.
 *
 * Square-specific restrictions: text only, no stickers/voice/image,
 * single attach button → opens PlacePickerSheet directly. Picked
 * places land in the body as "/directory/<id>"; the bubble renders
 * them via SmartTextWithPlacePreviews.
 */
export default function SquareComposer({
  currentUserId,
  onSent,
  replyingTo,
  setReplyingTo,
}: Props) {
  const { t, lang } = useLanguage()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [placePickerOpen, setPlacePickerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const intent = useMemo(() => detectSquareIntent(body), [body])

  // Refocus the input when the parent stages a reply so the user can
  // type immediately. Mirrors DM behaviour.
  useEffect(() => {
    if (replyingTo) {
      try { inputRef.current?.focus() } catch { /* ignore */ }
    }
  }, [replyingTo])

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/square/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: trimmed,
          ...(replyingTo ? { replyToMessageId: replyingTo.id } : {}),
        }),
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
        setReplyingTo(null)
      }
    } catch {
      toast.error(t('square_send_failed'))
    } finally {
      setSending(false)
    }
  }

  function handlePickPlace(item: { kind: 'place' | 'service'; id: string; name: string; phone?: string | null }) {
    const snippet =
      item.kind === 'service'
        ? (item.phone ? formatContactSnippet({ name: item.name, phone: item.phone }) : item.name)
        : `/directory/${item.id}`
    if (!snippet) return
    setBody((prev) => {
      if (!prev) return snippet
      if (prev.includes(snippet)) return prev
      return `${prev.trimEnd()}\n${snippet}`
    })
    try { inputRef.current?.focus() } catch { /* ignore */ }
  }

  const replyAuthorLabel = replyingTo
    ? replyingTo.authorId === currentUserId
      ? (lang === 'en' ? 'You' : lang === 'ur' ? 'آپ' : 'أنت')
      : (fullName({ name: replyingTo.authorName, lastName: replyingTo.authorLastName })
          || replyingTo.authorName
          || (lang === 'en' ? 'Neighbor' : 'جار'))
    : ''

  return (
    <>
      <div
        className="glass-bottom px-4 w-full z-20 flex-shrink-0"
        style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 10px)' }}
      >
        {intent && (
          <div
            className={`flex items-start gap-2 mx-1 mt-2 px-3 py-2 rounded-xl text-[12px] leading-relaxed ${
              intent.hard
                ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200'
                : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-100'
            }`}
          >
            <FiAlertCircle className="w-4 h-4 mt-[2px] flex-shrink-0" />
            <span>{intent.messageAr}</span>
          </div>
        )}

        {/* Reply preview bar — same look as DM. */}
        {replyingTo && (
          <div className="flex items-center gap-2 px-1 pt-2 pb-1">
            <div className="flex-1 min-w-0 border-s-2 border-primary-500 ps-2.5 py-0.5">
              <p className="text-[10px] font-bold text-primary-600 dark:text-primary-400">
                {replyAuthorLabel}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                {(replyingTo.body || '').slice(0, 80)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="p-1 text-gray-400 active:scale-90"
              aria-label={lang === 'en' ? 'Cancel reply' : 'إلغاء الرد'}
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 py-2.5">
          <button
            type="button"
            onClick={() => { hapticLight(); setPlacePickerOpen(true) }}
            aria-label={lang === 'en' ? 'Attach from directory' : 'إرفاق من الدليل'}
            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:text-primary-400 active:scale-90 transition-all flex-shrink-0"
          >
            <FiPaperclip className="w-5 h-5" />
          </button>

          <form onSubmit={send} className="flex-1 min-w-0 flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('square_message_placeholder')}
              maxLength={900}
              className="flex-1 min-w-0 bg-white/10 dark:bg-white/10 rounded-full px-4 py-2.5 text-[15px] text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-400/30 transition-shadow"
            />
            <button
              type="submit"
              disabled={sending || !body.trim()}
              className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center text-white disabled:opacity-30 flex-shrink-0 active:scale-90 transition-all shadow-sm hover:bg-primary-700 glow-primary"
              aria-label={t('square_message_send')}
            >
              <FiSend
                className="w-4.5 h-4.5"
                style={lang !== 'en' ? { transform: 'scaleX(-1)' } : undefined}
              />
            </button>
          </form>
        </div>
      </div>

      <PlacePickerSheet
        open={placePickerOpen}
        onClose={() => setPlacePickerOpen(false)}
        onSelect={handlePickPlace}
      />
    </>
  )
}

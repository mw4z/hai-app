'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { FiAlertCircle, FiArrowRight, FiPaperclip, FiSend, FiSmile, FiX } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { hapticLight } from '@/lib/haptic'
import { detectSquareIntent } from '@/lib/square/detectIntent'
import {
  buildConvertToPostHref,
  squareIntentToPostCategory,
} from '@/lib/square/convertToPost'
import { fullName } from '@/lib/displayName'
import AttachmentMenu from '@/components/AttachmentMenu'
import PlacePickerSheet from '@/components/places/PlacePickerSheet'
import StickerPicker from '@/components/StickerPicker'
import VoiceComposer from '@/components/chat/VoiceComposer'
import { formatContactSnippet } from '@/lib/contactPicker'
import { useAttachContact } from '@/hooks/useAttachContact'
import { uploadPdf } from '@/lib/upload'
import { getCurrentPositionSafe } from '@/lib/location/getCurrentPositionSafe'
import { toStickerRef } from '@/lib/stickers/catalog'
import type {
  PublicSquareMessage,
  PublicSquareReplyTo,
} from '@/lib/square/serializeMessage'

interface Props {
  currentUserId: string
  onSent: (message: PublicSquareMessage) => void
  /** Optimistic-send hooks — when these are present the composer
   *  shows a pending bubble (with a clock status icon) the moment
   *  the user taps send, then swaps it with the server response or
   *  drops it on failure. Mirrors the DM ChatClient pattern.
   *  Optional so legacy callers (none yet) can opt out. */
  onAddPending?: (placeholder: PublicSquareMessage) => void
  onSwapPending?: (tempId: string, real: PublicSquareMessage) => void
  onDropPending?: (tempId: string) => void
  replyingTo: PublicSquareReplyTo | null
  setReplyingTo: (r: PublicSquareReplyTo | null) => void
  /** When true, the composer is rendered read-only — all send
   *  affordances disabled. Used when an admin has locked the chat. */
  disabled?: boolean
  /** Keyboard is currently up — drop the safe-area inset below the
   *  composer (the bottom of the visual viewport IS the keyboard,
   *  so we don't need the home-indicator gap). Caller toggles this
   *  from its keyboardWillShow / Hide listener. */
  keyboardOpen?: boolean
}

/**
 * Square composer — mirrors the DM composer (ChatClient) with one
 * deliberate omission: NO image picker. The Square policy is text-
 * first and admin-only in MVP; arbitrary image uploads are blocked
 * at the API. Stickers ride on the "sticker:<id>" sentinel, same
 * pattern DM uses, so the imageUrl column NEVER carries a real
 * https:// URL.
 *
 * Wired DM components:
 *   - AttachmentMenu (Contact, Location, PDF, Place)
 *   - StickerPicker
 *   - VoiceComposer
 *   - PlacePickerSheet
 *   - useAttachContact
 *   - uploadPdf, getCurrentPositionSafe
 *
 * Each picker funnels into a small `postMessage(type, payload)` helper
 * that POSTs to /api/square/messages and appends to the parent list on
 * success — keeps the per-attachment plumbing one-liners instead of
 * the 100-line sendX functions the DM ChatClient grew over time.
 */
export default function SquareComposer({
  currentUserId,
  onSent,
  onAddPending,
  onSwapPending,
  onDropPending,
  replyingTo,
  setReplyingTo,
  disabled = false,
  keyboardOpen = false,
}: Props) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [placePickerOpen, setPlacePickerOpen] = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  // PDF input removed — Square no longer accepts PDF uploads.

  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // Auto-grow: re-measure scrollHeight every time `body` changes and
  // resize the textarea to fit, capped at MAX_HEIGHT_PX. Past the
  // cap the textarea keeps native vertical scroll. Single-line empty
  // input stays the same height as the old single-line <input>.
  const MAX_HEIGHT_PX = 140
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, MAX_HEIGHT_PX)
    el.style.height = next + 'px'
  }, [body])
  const intent = useMemo(() => detectSquareIntent(body), [body])

  // Typing signal — POST every TYPING_PING_MS while the body has
  // content. The server's TTL (5s) is intentionally longer than
  // the ping interval so an in-flight network blip doesn't make
  // the indicator flicker off. The signal stops naturally when
  // the user stops typing or sends; we don't issue an explicit
  // clear.
  const TYPING_PING_MS = 2_500
  const lastPingRef = useRef<number>(0)
  useEffect(() => {
    if (disabled) return
    if (!body.trim()) return
    const now = Date.now()
    if (now - lastPingRef.current < TYPING_PING_MS) return
    lastPingRef.current = now
    fetch('/api/square/typing', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {})
  }, [body, disabled])

  // Refocus input when a reply is staged (mirrors DM).
  useEffect(() => {
    if (replyingTo) {
      try { inputRef.current?.focus() } catch { /* ignore */ }
    }
  }, [replyingTo])

  /** Generic POST → /api/square/messages. When the parent provides
   *  optimistic hooks (onAddPending / onSwapPending / onDropPending),
   *  we render the message immediately with a 'pending-' id so the
   *  bubble shows the clock status icon; the real server message
   *  then replaces it in place, flipping the clock to the sent
   *  check. */
  async function postMessage(payload: Record<string, unknown>): Promise<boolean> {
    if (sending) return false
    setSending(true)

    // Build an optimistic placeholder when the parent supports it.
    // The bubble keys by id, so the placeholder's 'pending-' prefix
    // is the discriminator the status renderer uses.
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    let placeholder: PublicSquareMessage | null = null
    if (onAddPending) {
      const stagedReplyTo = replyingTo
      placeholder = {
        id: tempId,
        type: (payload.type as PublicSquareMessage['type']) || 'TEXT',
        body: typeof payload.body === 'string' ? payload.body : null,
        kind: 'GENERAL',
        status: 'ACTIVE',
        isPinned: false,
        pinnedAt: null,
        notificationFiredAt: null,
        reactions: [],
        replyToMessageId: stagedReplyTo?.id ?? null,
        replyTo: stagedReplyTo,
        createdAt: new Date().toISOString(),
        author: {
          id: currentUserId,
          name: null,
          lastName: null,
          avatarUrl: null,
          reputation: 0,
          membership: 'RESIDENT',
          role: 'RESIDENT',
        },
        isAuthor: true,
        lat: typeof payload.lat === 'number' ? payload.lat : null,
        lng: typeof payload.lng === 'number' ? payload.lng : null,
        pdfUrl: typeof payload.pdfUrl === 'string' ? payload.pdfUrl : null,
        pdfName: typeof payload.pdfName === 'string' ? payload.pdfName : null,
        audioUrl: typeof payload.audioUrl === 'string' ? payload.audioUrl : null,
        audioDurationMs: typeof payload.audioDurationMs === 'number' ? payload.audioDurationMs : null,
        audioMimeType: typeof payload.audioMimeType === 'string' ? payload.audioMimeType : null,
        imageUrl: typeof payload.imageUrl === 'string' ? payload.imageUrl : null,
        viewCount: 0,
      }
      onAddPending(placeholder)
    }

    try {
      const res = await fetch('/api/square/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          ...(replyingTo ? { replyToMessageId: replyingTo.id } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (placeholder && onDropPending) onDropPending(tempId)
        toast.error(
          typeof data.error === 'string'
            ? data.error
            : data.error?.message || t('square_send_failed'),
        )
        return false
      }
      if (data?.message) {
        const real = data.message as PublicSquareMessage
        if (placeholder && onSwapPending) {
          onSwapPending(tempId, real)
        } else {
          onSent(real)
        }
        setReplyingTo(null)
      }
      return true
    } catch {
      if (placeholder && onDropPending) onDropPending(tempId)
      toast.error(t('square_send_failed'))
      return false
    } finally {
      setSending(false)
    }
  }

  async function sendText(e?: React.FormEvent) {
    e?.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) return
    const ok = await postMessage({ type: 'TEXT', body: trimmed })
    if (ok) setBody('')
  }

  // ── Attachment helpers ───────────────────────────────────────────
  // Contact picker — returns a formatted snippet string; we wrap it
  // into a TEXT message (same as DM).
  const getContactSnippet = useAttachContact()
  async function attachContact() {
    try {
      const snippet = await getContactSnippet()
      if (!snippet) return
      await postMessage({ type: 'TEXT', body: snippet })
    } catch {
      // useAttachContact handles its own user-facing errors.
    }
  }

  async function pickLocation() {
    try {
      const pos = await getCurrentPositionSafe()
      await postMessage({
        type: 'LOCATION',
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      })
    } catch {
      toast.error(lang === 'en' ? 'Location unavailable' : 'تعذر الحصول على الموقع')
    }
  }

  // handlePdfFile removed — PDF attachments are disabled on Square.

  async function sendVoice(blob: Blob, mimeType: string, durationMs: number, sizeBytes: number) {
    if (sending) return
    setSending(true)
    try {
      const form = new FormData()
      form.append('file', blob, `voice.${(mimeType.split('/')[1] || 'webm').split(';')[0]}`)
      const up = await fetch('/api/upload', { method: 'POST', body: form })
      const upJson = await up.json().catch(() => ({}))
      const url = Array.isArray(upJson?.urls) ? upJson.urls[0] : upJson?.url
      if (!up.ok || !url) {
        toast.error(lang === 'en' ? 'Upload failed' : 'فشل الرفع')
        return
      }
      await postMessage({
        type: 'VOICE',
        audioUrl: url,
        audioDurationMs: durationMs,
        audioMimeType: mimeType,
        audioSizeBytes: sizeBytes,
      })
    } catch {
      toast.error(lang === 'en' ? 'Upload failed' : 'فشل الرفع')
    } finally {
      setSending(false)
    }
  }

  async function sendSticker(stickerId: string) {
    setShowStickers(false)
    await postMessage({ type: 'STICKER', imageUrl: toStickerRef(stickerId) })
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

  const replyTypeIcon =
    replyingTo?.type === 'VOICE' ? '🎤 ' :
    replyingTo?.type === 'PDF' ? '📄 PDF ' :
    replyingTo?.type === 'LOCATION' ? '📍 ' :
    replyingTo?.type === 'STICKER' ? (lang === 'en' ? '🖼️ Sticker ' : '🖼️ ملصق ') :
    ''

  // When the admin lock is on for a non-mod, the parent renders an
  // explanatory banner above us; hide the composer entirely so the
  // resident isn't tempted to type into a dead field.
  if (disabled) return null

  return (
    <>
      <div
        className="glass-bottom px-4 w-full z-20 flex-shrink-0"
        style={{
          paddingBottom: keyboardOpen ? '10px' : 'calc(var(--hai-safe-bottom, 0px) + 10px)',
          transition: 'padding-bottom 180ms ease-out',
        }}
      >
        {intent && (
          <div
            className={`mx-1 mt-2 px-3 py-2 rounded-xl text-[12px] leading-relaxed ${
              intent.hard
                ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200'
                : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-100'
            }`}
          >
            <div className="flex items-start gap-2">
              <FiAlertCircle className="w-4 h-4 mt-[2px] flex-shrink-0" />
              <span>{intent.messageAr}</span>
            </div>
            {/* Convert-to-post escape hatch — appears below the soft
                nudge body so the user can carry their already-typed
                text into the proper section composer (Services /
                Lost & Found / Marketplace / Neighborhood Reports)
                instead of losing it. Hidden for HARD blocks (group
                invites / repeat-promo) — those are policy refusals,
                not redirects. */}
            {!intent.hard && (
              <button
                type="button"
                onClick={() => {
                  hapticLight()
                  const href = buildConvertToPostHref({
                    body,
                    category: squareIntentToPostCategory(intent.code),
                  })
                  router.push(href)
                }}
                className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold bg-primary-600 text-white shadow-sm active:scale-[0.98] transition-transform"
              >
                <span aria-hidden>📝</span>
                <span>{lang === 'en' ? 'Convert to a post' : 'حوّلها إلى منشور'}</span>
                <FiArrowRight className={`w-4 h-4 ${lang !== 'en' ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        )}

        {replyingTo && (
          <div className="flex items-center gap-2 px-1 pt-2 pb-1">
            <div className="flex-1 min-w-0 border-s-2 border-primary-500 ps-2.5 py-0.5">
              <p className="text-[10px] font-bold text-primary-600 dark:text-primary-400">
                {replyAuthorLabel}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                {replyTypeIcon}{(replyingTo.body || '').slice(0, 80)}
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
          {/* PDF attachments are DISABLED in Square per content
              policy — the AttachmentMenu below no longer renders the
              "Document" tile, and this composer's PDF file input
              and handler are gone. PDF rendering for legacy/older
              messages still works in SquareBubble; only new uploads
              are blocked. */}

          <button
            type="button"
            onClick={() => { hapticLight(); setShowAttachMenu(true) }}
            disabled={sending}
            aria-label={lang === 'en' ? 'Attach' : 'إرفاق'}
            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:text-primary-400 active:scale-90 transition-all disabled:opacity-50 flex-shrink-0"
          >
            <FiPaperclip className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => { hapticLight(); setShowStickers(true) }}
            aria-label={lang === 'en' ? 'Stickers' : 'ملصقات'}
            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:text-primary-400 active:scale-90 transition-all flex-shrink-0"
          >
            <FiSmile className="w-5 h-5" />
          </button>

          {/* Voice recorder — same component DM uses; on send it
              receives the recorded blob + metadata and posts as a
              VOICE message. */}
          <VoiceComposer onSend={sendVoice} disabled={sending} />

          <form onSubmit={sendText} className="flex-1 min-w-0 flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter inserts a newline. Matches
                // the universal chat convention. Native textarea behavior
                // is "Enter = newline" so we have to suppress + submit.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  if (body.trim() && !sending) sendText(e as unknown as React.FormEvent)
                }
              }}
              placeholder={t('square_message_placeholder')}
              maxLength={900}
              rows={1}
              className="flex-1 min-w-0 bg-white/10 dark:bg-white/10 rounded-2xl px-4 py-2.5 text-[15px] text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 border border-white/10 focus:outline-none focus:ring-2 focus:ring-primary-400/40 focus:border-primary-400/30 transition-shadow resize-none leading-relaxed"
              style={{ maxHeight: 140, overflowY: 'auto' }}
            />
            <button
              type="submit"
              disabled={sending || !body.trim()}
              className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center text-white disabled:opacity-30 flex-shrink-0 active:scale-90 transition-all shadow-sm hover:bg-primary-700 glow-primary mb-0.5"
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

      <AttachmentMenu
        open={showAttachMenu}
        onClose={() => setShowAttachMenu(false)}
        onPickContact={attachContact}
        onPickLocation={pickLocation}
        onPickPlace={() => setPlacePickerOpen(true)}
      />

      <PlacePickerSheet
        open={placePickerOpen}
        onClose={() => setPlacePickerOpen(false)}
        onSelect={handlePickPlace}
      />

      <StickerPicker
        open={showStickers}
        onClose={() => setShowStickers(false)}
        onPick={(id) => sendSticker(id)}
      />
    </>
  )
}

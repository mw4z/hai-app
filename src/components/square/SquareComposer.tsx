'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FiAlertCircle, FiPaperclip, FiSend, FiSmile, FiX } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { hapticLight } from '@/lib/haptic'
import { detectSquareIntent } from '@/lib/square/detectIntent'
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
  replyingTo: PublicSquareReplyTo | null
  setReplyingTo: (r: PublicSquareReplyTo | null) => void
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
  replyingTo,
  setReplyingTo,
}: Props) {
  const { t, lang } = useLanguage()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [placePickerOpen, setPlacePickerOpen] = useState(false)
  const [showStickers, setShowStickers] = useState(false)
  const pdfInputRef = useRef<HTMLInputElement | null>(null)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const intent = useMemo(() => detectSquareIntent(body), [body])

  // Refocus input when a reply is staged (mirrors DM).
  useEffect(() => {
    if (replyingTo) {
      try { inputRef.current?.focus() } catch { /* ignore */ }
    }
  }, [replyingTo])

  /** Generic POST → /api/square/messages. Returns the created message
   *  shape so the caller can append + clear reply state on success. */
  async function postMessage(payload: Record<string, unknown>): Promise<boolean> {
    if (sending) return false
    setSending(true)
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
        toast.error(
          typeof data.error === 'string'
            ? data.error
            : data.error?.message || t('square_send_failed'),
        )
        return false
      }
      if (data?.message) {
        onSent(data.message as PublicSquareMessage)
        setReplyingTo(null)
      }
      return true
    } catch {
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

  async function handlePdfFile(file: File) {
    if (sending) return
    setSending(true)
    try {
      const url = await uploadPdf(file)
      if (!url) {
        toast.error(lang === 'en' ? 'Upload failed' : 'فشل الرفع')
        return
      }
      await postMessage({ type: 'PDF', pdfUrl: url, pdfName: file.name })
    } catch {
      toast.error(lang === 'en' ? 'Upload failed' : 'فشل الرفع')
    } finally {
      setSending(false)
    }
  }

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
          {/* Hidden PDF input — the AttachmentMenu's "Document" option
              triggers a click on this. Same flow DM uses. */}
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handlePdfFile(file)
              if (pdfInputRef.current) pdfInputRef.current.value = ''
            }}
          />

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

          <form onSubmit={sendText} className="flex-1 min-w-0 flex items-center gap-2">
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

      <AttachmentMenu
        open={showAttachMenu}
        onClose={() => setShowAttachMenu(false)}
        onPickContact={attachContact}
        onPickLocation={pickLocation}
        onPickDocument={() => pdfInputRef.current?.click()}
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

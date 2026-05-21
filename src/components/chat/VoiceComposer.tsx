'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { FiMic, FiTrash2, FiSend, FiSquare, FiPlay, FiPause } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { voiceRecorder, RecorderError, type RecorderResult } from '@/lib/voiceRecorder'

const MAX_MS = 5 * 60_000 // hard cap, mirrors the server clamp

type Phase = 'idle' | 'recording' | 'preview' | 'sending'

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

/**
 * Voice-note recorder for the chat composer.
 *  - idle: a mic button (rendered inline where the parent places it).
 *  - recording / preview / sending: a fixed bar pinned above the
 *    composer (portal) — decoupled from the composer layout.
 * Flow: tap mic → record (timer, cancel, stop) → preview (play, delete,
 * send) → onSend uploads + posts. Auto-stops at MAX_MS. Cancel leaves
 * no message and no orphan upload (upload only happens on send).
 */
export default function VoiceComposer({
  onSend,
  disabled,
}: {
  onSend: (blob: Blob, mimeType: string, durationMs: number, sizeBytes: number) => Promise<void>
  disabled?: boolean
}) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) => (lang === 'en' ? en : lang === 'ur' ? ur : ar)

  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const recordedRef = useRef<RecorderResult | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  function clearTick() {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
  }
  function revokePreview() {
    if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null }
  }
  useEffect(() => () => { clearTick(); revokePreview() }, [])

  async function start() {
    if (disabled || phase !== 'idle') return
    try {
      await voiceRecorder.start()
      setElapsed(0)
      setPhase('recording')
      tickRef.current = setInterval(() => {
        setElapsed((e) => {
          const next = e + 200
          if (next >= MAX_MS) { void stop() }
          return next
        })
      }, 200)
    } catch (err) {
      const code = err instanceof RecorderError ? err.code : 'failed'
      toast.error(
        code === 'permission'
          ? tr('Microphone permission denied', 'تم رفض إذن الميكروفون', 'مائیکروفون کی اجازت مسترد')
          : code === 'unsupported'
            ? tr('Recording not supported here', 'التسجيل غير مدعوم هنا', 'ریکارڈنگ یہاں معاون نہیں')
            : tr('Could not start recording', 'تعذّر بدء التسجيل', 'ریکارڈنگ شروع نہیں ہو سکی'),
      )
      setPhase('idle')
    }
  }

  async function stop() {
    if (phase !== 'recording') return
    clearTick()
    try {
      const res = await voiceRecorder.stop()
      if (!res.blob || res.blob.size < 512) {
        toast.error(tr('Recording too short', 'التسجيل قصير جداً', 'ریکارڈنگ بہت مختصر'))
        setPhase('idle')
        return
      }
      recordedRef.current = res
      revokePreview()
      previewUrlRef.current = URL.createObjectURL(res.blob)
      setPreviewPlaying(false)
      setPhase('preview')
    } catch {
      toast.error(tr('Recording failed', 'فشل التسجيل', 'ریکارڈنگ ناکام'))
      setPhase('idle')
    }
  }

  async function cancel() {
    clearTick()
    try { await voiceRecorder.cancel() } catch {}
    discard()
  }

  function discard() {
    revokePreview()
    recordedRef.current = null
    setElapsed(0)
    setPreviewPlaying(false)
    setPhase('idle')
  }

  async function send() {
    const rec = recordedRef.current
    if (!rec) return
    setPhase('sending')
    try {
      await onSend(rec.blob, rec.mimeType, rec.durationMs, rec.blob.size)
      discard() // success → clean up; the parent rendered the message
    } catch {
      // Upload/post failed — keep the recording, return to preview so
      // the user can retry. No broken message was created.
      toast.error(tr('Send failed — try again', 'فشل الإرسال — حاول مجدداً', 'بھیجنا ناکام — دوبارہ کوشش'))
      setPhase('preview')
    }
  }

  function togglePreview() {
    const a = previewAudioRef.current
    if (!a) return
    if (previewPlaying) a.pause()
    else a.play().catch(() => {})
  }

  // Inline mic button — always present where the parent slots it.
  const micButton = (
    <button
      type="button"
      onClick={start}
      disabled={disabled || phase !== 'idle'}
      aria-label={tr('Record voice note', 'تسجيل ملاحظة صوتية', 'صوتی نوٹ ریکارڈ')}
      className="w-10 h-10 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 active:scale-95 transition-transform disabled:opacity-40"
    >
      <FiMic className="w-5 h-5" />
    </button>
  )

  const active = phase !== 'idle'
  const overlay = active && mounted && createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-[60] bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-[0_-4px_16px_rgba(0,0,0,0.12)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="max-w-[760px] mx-auto px-4 py-3 flex items-center gap-3">
        {phase === 'recording' && (
          <>
            <button
              type="button"
              onClick={cancel}
              aria-label={tr('Cancel', 'إلغاء', 'منسوخ')}
              className="w-10 h-10 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400 active:scale-95"
            >
              <FiTrash2 className="w-5 h-5" />
            </button>
            <div className="flex-1 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse flex-shrink-0" />
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 tabular-nums">
                {fmt(elapsed)}
              </span>
              <span className="text-[11px] text-gray-400">
                {tr('Recording…', 'جارٍ التسجيل…', 'ریکارڈنگ…')}
              </span>
            </div>
            <button
              type="button"
              onClick={stop}
              aria-label={tr('Stop', 'إيقاف', 'روکیں')}
              className="w-11 h-11 rounded-full bg-primary-600 text-white flex items-center justify-center active:scale-95"
            >
              <FiSquare className="w-4 h-4" />
            </button>
          </>
        )}

        {(phase === 'preview' || phase === 'sending') && (
          <>
            <button
              type="button"
              onClick={discard}
              disabled={phase === 'sending'}
              aria-label={tr('Delete', 'حذف', 'حذف')}
              className="w-10 h-10 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400 active:scale-95 disabled:opacity-40"
            >
              <FiTrash2 className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={togglePreview}
              disabled={phase === 'sending'}
              className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 flex items-center justify-center active:scale-95 disabled:opacity-40"
              aria-label={previewPlaying ? tr('Pause', 'إيقاف مؤقت', 'وقفہ') : tr('Play', 'تشغيل', 'چلائیں')}
            >
              {previewPlaying ? <FiPause className="w-4 h-4" /> : <FiPlay className="w-4 h-4 ms-0.5" />}
            </button>
            <div className="flex-1 text-sm text-gray-700 dark:text-gray-200 tabular-nums">
              {fmt(recordedRef.current?.durationMs ?? 0)}
            </div>
            <button
              type="button"
              onClick={send}
              disabled={phase === 'sending'}
              aria-label={tr('Send', 'إرسال', 'بھیجیں')}
              className="w-11 h-11 rounded-full bg-primary-600 text-white flex items-center justify-center active:scale-95 disabled:opacity-60"
            >
              {phase === 'sending' ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <FiSend className="w-4 h-4" />
              )}
            </button>
            {previewUrlRef.current && (
              <audio
                ref={previewAudioRef}
                src={previewUrlRef.current}
                className="hidden"
                onPlay={() => setPreviewPlaying(true)}
                onPause={() => setPreviewPlaying(false)}
                onEnded={() => setPreviewPlaying(false)}
              />
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )

  return (
    <>
      {micButton}
      {overlay}
    </>
  )
}

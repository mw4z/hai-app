'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FiArrowLeft, FiArrowRight } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import SquareMessageRow from '@/components/square/SquareMessageRow'
import SquareComposer from '@/components/square/SquareComposer'
import type { PublicSquareMessage } from '@/lib/square/serializeMessage'

interface Props {
  /** First page of messages, oldest→newest (server returns ascending). */
  initialMessages: PublicSquareMessage[]
  /** True if older messages exist beyond the first SSR page. */
  hasMoreOlder: boolean
  neighborhoodName: string
}

/**
 * The Square — one shared neighborhood message space. Layout is
 * chat-shaped: chronological list (oldest at top, newest at bottom),
 * sticky bottom composer right above the BottomNav. On mount we
 * scroll to the bottom of the list so the newest message is in
 * view; on send we append + scroll; on scroll-up to the top we
 * paginate older messages and prepend without losing the scroll
 * anchor.
 *
 * No /square/[id], no /square/new, no thread metaphor.
 */
export default function SquareFeedClient({
  initialMessages,
  hasMoreOlder: initialHasMore,
  neighborhoodName,
}: Props) {
  const { t, lang } = useLanguage()
  const router = useRouter()

  const [messages, setMessages] = useState<PublicSquareMessage[]>(initialMessages)
  const [hasMoreOlder, setHasMoreOlder] = useState(initialHasMore)
  const [loadingOlder, setLoadingOlder] = useState(false)

  const listRef = useRef<HTMLDivElement | null>(null)
  const endAnchorRef = useRef<HTMLDivElement | null>(null)
  // Used to preserve the scroll position when we PREPEND older messages.
  const preserveScrollFromHeight = useRef<number | null>(null)

  // First paint: snap to the bottom so the newest message is in view
  // right under the composer. instant — no animation on initial mount.
  useEffect(() => {
    endAnchorRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' })
  }, [])

  // After prepending older messages, restore the scroll position so
  // the user's view stays anchored on the same row they were reading.
  useEffect(() => {
    const fromHeight = preserveScrollFromHeight.current
    if (fromHeight == null) return
    const el = listRef.current
    if (!el) return
    const delta = el.scrollHeight - fromHeight
    el.scrollTop = (el.scrollTop || 0) + delta
    preserveScrollFromHeight.current = null
  }, [messages.length])

  async function loadOlder() {
    if (loadingOlder || !hasMoreOlder || messages.length === 0) return
    setLoadingOlder(true)
    const oldestIso = messages[0].createdAt
    preserveScrollFromHeight.current = listRef.current?.scrollHeight ?? null
    try {
      const res = await fetch(`/api/square/messages?before=${encodeURIComponent(oldestIso)}`, {
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      const older: PublicSquareMessage[] = Array.isArray(data?.messages) ? data.messages : []
      // older is server-side ascending; prepend in order.
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
  }

  function handleScroll() {
    const el = listRef.current
    if (!el) return
    // When the user nears the top edge, kick off older-page load.
    if (el.scrollTop < 80 && hasMoreOlder && !loadingOlder) {
      loadOlder()
    }
  }

  function handleSent(msg: PublicSquareMessage) {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
    // Defer scroll-to-bottom one tick so the new row mounts first.
    setTimeout(() => endAnchorRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), 0)
  }

  const empty = messages.length === 0

  return (
    // h-screen + h-[100dvh] bounds the main to exactly the viewport so
    // the flex-1 child becomes the only scroll surface. Without that
    // bound, `min-h-screen` lets the document itself scroll and the
    // header rides along with the page.
    <main className="h-screen h-[100dvh] overflow-hidden bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/*
        TOP SAFE-AREA — bulletproof approach:
        1. Cancel the global `body { padding-top: safe-area-inset-top }`
           ONLY on this page so the layout starts at viewport y=0.
        2. The header itself carries `paddingTop: safe-area-inset-top`,
           so its OWN background (bg-white / bg-gray-800) paints the
           notch/status-bar zone with no colour-matching gymnastics.
        Net result: header + safe-area zone are literally one element
        with one background — no html::before chrome leaking through.
      */}
      <style>{`
        body { padding-top: 0 !important; }
      `}</style>
      <div
        className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-[640px] mx-auto px-4 pt-3 pb-3">
          <div className="flex items-center gap-2">
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
      </div>

      {/* Message list — flex-1, independently scrollable. Padding
          bottom leaves room for the sticky composer + bottom nav so
          the last row isn't hidden under them. */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
        style={{
          paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 11rem)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="max-w-[640px] mx-auto px-3 pt-4 space-y-2">
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
            messages.map((m) => <SquareMessageRow key={m.id} message={m} />)
          )}
          <div ref={endAnchorRef} />
        </div>
      </div>

      <SquareComposer onSent={handleSent} />
    </main>
  )
}

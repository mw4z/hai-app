'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useConfirm } from '@/components/ConfirmProvider'
import { FiX, FiStar, FiHeart, FiMessageSquare, FiClock } from 'react-icons/fi'
import type { TranslationKey } from '@/lib/i18n'
import { buildDisplayTitle } from '@/lib/posts/displayTitle'

export interface HighlightItemPayload {
  id: string
  title: string
  body: string
  category: string
  intent: 'OFFER' | 'REQUEST' | 'NORMAL'
  badge: 'pinned' | 'important' | 'popular' | null
  createdAt: string
  authorId: string
  authorName: string | null
  imageUrls: string[]
  reactionCount: number
  commentCount: number
}

const CATEGORY_ICON: Record<string, string> = {
  NEIGHBORHOOD_REPORTS: '⚠️',
  LOST_FOUND:           '🔍',
  SERVICES:             '🔧',
  EVENTS:               '🎉',
  HOME_BUSINESSES:      '🍱',
  MARKETPLACE:          '🛒',
  REAL_ESTATE:          '🏠',
  RIDES:                '🚗',
  COMPETITIONS:         '🏆',
  GENERAL:              '💬',
}

function badgeKey(b: HighlightItemPayload['badge']): TranslationKey | null {
  if (b === 'pinned')    return 'highlights_badge_pinned'
  if (b === 'important') return 'highlights_badge_important'
  if (b === 'popular')   return 'highlights_badge_popular'
  return null
}

function timeAgo(dateStr: string, lang: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return lang === 'en' ? 'now' : 'الآن'
  if (mins < 60) return lang === 'en' ? `${mins}m` : `${mins}د`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return lang === 'en' ? `${hrs}h` : `${hrs}س`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return lang === 'en' ? `${days}d` : `${days}ي`
  const weeks = Math.floor(days / 7)
  return lang === 'en' ? `${weeks}w` : `${weeks}أ`
}

const SEEN_KEY = 'hai_highlights_seen_v1'

// Bar-level "hide for a while" affordance. One × on the trigger bar
// (NOT per item) hides the entire HighlightsSection for 7 days.
// Server content is unchanged — this is purely a per-device, per-user
// preference. Stored as a single timestamp so a future re-show happens
// automatically without a stale-ID cleanup pass.
const BAR_HIDDEN_KEY = 'hai:highlights-bar-hidden-at'
const BAR_HIDDEN_TTL_MS = 7 * 24 * 3600_000

function readBarHiddenAt(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(BAR_HIDDEN_KEY)
    if (!raw) return null
    const at = Number(raw)
    if (!Number.isFinite(at)) return null
    if (Date.now() - at >= BAR_HIDDEN_TTL_MS) return null
    return at
  } catch { return null }
}

function writeBarHiddenAt(at: number) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(BAR_HIDDEN_KEY, String(at)) } catch { /* */ }
}

interface Props {
  items: HighlightItemPayload[]
  /** When true, the section auto-opens the modal once per device. */
  autoOpenForFirstTime?: boolean
}

export default function HighlightsSection({ items, autoOpenForFirstTime = true }: Props) {
  const { t, lang } = useLanguage()
  const confirmDialog = useConfirm()
  const [open, setOpen] = useState(false)
  // Hydrate after mount — SSR can't read localStorage, and starting
  // null keeps server/first-client markup identical (no hydration
  // mismatch).
  const [barHiddenAt, setBarHiddenAt] = useState<number | null>(null)
  useEffect(() => { setBarHiddenAt(readBarHiddenAt()) }, [])

  // Lock feed scroll while the modal is open — same hook every other
  // sheet uses so the backdrop never bleeds touch into the page below.
  useBodyScrollLock(open)

  useEffect(() => {
    if (!autoOpenForFirstTime) return
    if (items.length === 0) return
    if (barHiddenAt !== null) return
    try {
      const seen = localStorage.getItem(SEEN_KEY)
      if (!seen) {
        setOpen(true)
        localStorage.setItem(SEEN_KEY, '1')
      }
    } catch { /* ignore */ }
  }, [autoOpenForFirstTime, items.length, barHiddenAt])

  if (items.length === 0) return null
  if (barHiddenAt !== null) return null

  async function hideBar() {
    // App-styled confirm via the project's ConfirmProvider (same
    // surface BottomNav, AdminClient, etc. use). Stays inside the
    // Hai design language — no OS-level dialog.
    const ok = await confirmDialog({
      title:
        lang === 'en' ? 'Hide highlights?'
        : lang === 'ur' ? 'ہائی لائٹس چھپائیں؟'
        : 'إخفاء "المهم"؟',
      message:
        lang === 'en' ? 'Hide this section for a week. It will come back on its own after that.'
        : lang === 'ur' ? 'یہ سیکشن ایک ہفتے کیلئے چھپ جائے گا، پھر خود واپس آ جائے گا۔'
        : 'سيتم إخفاء هذا القسم لمدة أسبوع، وسيعود تلقائياً بعد ذلك.',
      confirmText:
        lang === 'en' ? 'Hide'
        : lang === 'ur' ? 'چھپائیں'
        : 'إخفاء',
      cancelText:
        lang === 'en' ? 'Cancel'
        : lang === 'ur' ? 'منسوخ'
        : 'إلغاء',
    })
    if (!ok) return
    const now = Date.now()
    writeBarHiddenAt(now)
    setBarHiddenAt(now)
    setOpen(false)
  }

  function go(postId: string) {
    setOpen(false)
    // Posts only render inline in the feed — there's no /post/[id] route.
    // Scroll the user to the post AFTER the body-scroll-lock release has
    // settled (otherwise the browser's saved-scrollY restore fights the
    // smooth scroll and the page visibly jiggles). 80ms is enough for
    // useBodyScrollLock's effect cleanup + the next paint.
    setTimeout(() => {
      const el = document.getElementById(`post-${postId}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('hai-highlight-flash')
      setTimeout(() => el.classList.remove('hai-highlight-flash'), 1800)
    }, 80)
  }

  return (
    <>
      {/* Bar = row-button (opens modal) + dismiss × (hides the whole
          surface for 7 days). Siblings, not nested, so the × can't
          bubble into the open handler. Flex direction puts the × on
          the trailing edge — visual right in LTR, visual left in RTL,
          no manual direction logic. */}
      <div className="w-full mx-auto flex items-stretch bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-y border-amber-100 dark:border-amber-900/40">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-1 min-w-0 flex items-center gap-2 px-4 py-2.5 active:opacity-80 text-start"
        >
          <FiStar className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span className="text-sm font-semibold text-amber-900 dark:text-amber-200 truncate flex-1 text-start">
            📌 {t('highlights_title')}
          </span>
          <span className="text-xs text-amber-700 dark:text-amber-300 flex-shrink-0">
            {items.length}
          </span>
        </button>
        <button
          type="button"
          onClick={hideBar}
          className="flex-shrink-0 self-stretch px-3 flex items-center justify-center text-xs font-semibold text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 active:opacity-60"
        >
          {lang === 'en' ? 'Hide' : lang === 'ur' ? 'چھپائیں' : 'إخفاء'}
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
          data-overlay="true"
          onClick={() => setOpen(false)}
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
          }}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{
              height: 'min(80dvh, 640px)',
              maxHeight: 'calc(100dvh - 80px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              <FiStar className="w-5 h-5 text-amber-500" />
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-gray-900 dark:text-white">{t('highlights_title')}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{t('highlights_intro')}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label={t('highlights_close')}
                className="p-1.5 rounded-full active:bg-gray-100 dark:active:bg-gray-800"
              >
                <FiX className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((it) => {
                  const bk = badgeKey(it.badge)
                  const icon = CATEGORY_ICON[it.category] || '💬'
                  const thumb = it.imageUrls?.[0]
                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => go(it.id)}
                        className="w-full text-start flex gap-3 px-4 py-3 active:bg-gray-50 dark:active:bg-gray-800"
                      >
                        {/* Thumbnail OR category icon */}
                        {thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-gray-100 dark:bg-gray-800"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-2xl flex-shrink-0">
                            {icon}
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          {/* Title + badge */}
                          <div className="flex items-start gap-2 mb-0.5">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 flex-1">
                              {buildDisplayTitle({ title: it.title, body: it.body, category: it.category as any }, lang as 'ar' | 'en' | 'ur')}
                            </p>
                            {bk && (
                              <span
                                className={
                                  it.badge === 'pinned'
                                    ? 'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 flex-shrink-0'
                                    : it.badge === 'important'
                                      ? 'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 flex-shrink-0'
                                      : 'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 flex-shrink-0'
                                }
                              >
                                {t(bk)}
                              </span>
                            )}
                          </div>

                          {/* Body snippet */}
                          {it.body && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-1">
                              {it.body}
                            </p>
                          )}

                          {/* Meta row: author • time • engagement */}
                          <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
                            {it.authorName && (
                              <span className="truncate max-w-[35%]">{it.authorName}</span>
                            )}
                            <span className="flex items-center gap-0.5 flex-shrink-0">
                              <FiClock className="w-3 h-3" />
                              {timeAgo(it.createdAt, lang)}
                            </span>
                            {it.reactionCount > 0 && (
                              <span className="flex items-center gap-0.5 flex-shrink-0">
                                <FiHeart className="w-3 h-3" />
                                {it.reactionCount}
                              </span>
                            )}
                            {it.commentCount > 0 && (
                              <span className="flex items-center gap-0.5 flex-shrink-0">
                                <FiMessageSquare className="w-3 h-3" />
                                {it.commentCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

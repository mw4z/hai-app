'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { FiX, FiStar, FiHeart, FiMessageSquare, FiClock } from 'react-icons/fi'
import type { TranslationKey } from '@/lib/i18n'

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

// Per-user, per-device dismiss list. A small × on each highlight card
// hides that specific item locally for 7 days; the entry is server-
// authoritative content, so dismissing must never call the API or
// mutate the post. Entries past TTL get filtered on read so stale IDs
// don't accumulate.
const DISMISS_KEY = 'hai:dismissed-highlights'
const DISMISS_TTL_MS = 7 * 24 * 3600_000

interface DismissEntry { id: string; at: number }

function readDismissed(): DismissEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const now = Date.now()
    return parsed
      .filter((e): e is DismissEntry =>
        e && typeof e === 'object' && typeof e.id === 'string' && typeof e.at === 'number')
      .filter(e => now - e.at < DISMISS_TTL_MS)
  } catch { return [] }
}

function writeDismissed(entries: DismissEntry[]) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(entries)) } catch { /* */ }
}

interface Props {
  items: HighlightItemPayload[]
  /** When true, the section auto-opens the modal once per device. */
  autoOpenForFirstTime?: boolean
}

export default function HighlightsSection({ items, autoOpenForFirstTime = true }: Props) {
  const { t, lang } = useLanguage()
  const [open, setOpen] = useState(false)
  // Hydrate dismissed-IDs from localStorage AFTER mount. SSR starts
  // empty so the server-rendered markup matches the first client
  // render (no hydration mismatch). The post-mount effect then trims
  // the visible set. Brief flicker is invisible: the modal isn't open
  // by default, and the trigger bar only shows a count.
  const [dismissed, setDismissed] = useState<DismissEntry[]>([])
  useEffect(() => { setDismissed(readDismissed()) }, [])

  const visible = useMemo(() => {
    if (dismissed.length === 0) return items
    const dropped = new Set(dismissed.map(e => e.id))
    return items.filter(it => !dropped.has(it.id))
  }, [items, dismissed])

  // Lock feed scroll while the modal is open — same hook every other
  // sheet uses so the backdrop never bleeds touch into the page below.
  useBodyScrollLock(open)

  useEffect(() => {
    if (!autoOpenForFirstTime) return
    if (visible.length === 0) return
    try {
      const seen = localStorage.getItem(SEEN_KEY)
      if (!seen) {
        setOpen(true)
        localStorage.setItem(SEEN_KEY, '1')
      }
    } catch { /* ignore */ }
  }, [autoOpenForFirstTime, visible.length])

  // Close the modal automatically when the user dismisses the last
  // visible item — otherwise they're staring at an empty list.
  useEffect(() => {
    if (open && visible.length === 0) setOpen(false)
  }, [open, visible.length])

  if (visible.length === 0) return null

  function dismiss(id: string) {
    setDismissed(prev => {
      const filtered = prev.filter(e => e.id !== id)
      const next = [...filtered, { id, at: Date.now() }]
      writeDismissed(next)
      return next
    })
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full mx-auto flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-y border-amber-100 dark:border-amber-900/40 active:opacity-80"
      >
        <FiStar className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <span className="text-sm font-semibold text-amber-900 dark:text-amber-200 truncate flex-1 text-start">
          📌 {t('highlights_title')}
        </span>
        <span className="text-xs text-amber-700 dark:text-amber-300 flex-shrink-0">
          {visible.length}
        </span>
      </button>

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
                {visible.map((it) => {
                  const bk = badgeKey(it.badge)
                  const icon = CATEGORY_ICON[it.category] || '💬'
                  const thumb = it.imageUrls?.[0]
                  return (
                    // The row-button and dismiss-button are siblings (not
                    // nested) so a tap on × never bubbles into the
                    // scroll-to-post handler. Flex naturally lays the
                    // dismiss on the trailing edge: visual right in LTR,
                    // visual left in RTL — no manual direction logic.
                    <li key={it.id} className="flex items-stretch active:bg-gray-50 dark:active:bg-gray-800">
                      <button
                        type="button"
                        onClick={() => go(it.id)}
                        className="flex-1 min-w-0 text-start flex gap-3 px-4 py-3"
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
                              {it.title}
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
                      <button
                        type="button"
                        onClick={() => dismiss(it.id)}
                        aria-label={lang === 'en' ? 'Dismiss' : lang === 'ur' ? 'ہٹائیں' : 'إخفاء'}
                        className="flex-shrink-0 self-stretch px-3 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 active:opacity-70"
                      >
                        <FiX className="w-4 h-4" />
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

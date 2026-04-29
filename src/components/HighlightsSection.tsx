'use client'

import { useEffect, useState } from 'react'
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

interface Props {
  items: HighlightItemPayload[]
  /** When true, the section auto-opens the modal once per device. */
  autoOpenForFirstTime?: boolean
}

export default function HighlightsSection({ items, autoOpenForFirstTime = true }: Props) {
  const { t, lang } = useLanguage()
  const [open, setOpen] = useState(false)

  // Lock feed scroll while the modal is open — same hook every other
  // sheet uses so the backdrop never bleeds touch into the page below.
  useBodyScrollLock(open)

  useEffect(() => {
    if (!autoOpenForFirstTime) return
    if (items.length === 0) return
    try {
      const seen = localStorage.getItem(SEEN_KEY)
      if (!seen) {
        setOpen(true)
        localStorage.setItem(SEEN_KEY, '1')
      }
    } catch { /* ignore */ }
  }, [autoOpenForFirstTime, items.length])

  if (items.length === 0) return null

  function go(postId: string) {
    setOpen(false)
    // Posts only render inline in the feed — there's no /post/[id] route.
    // Scroll the user to the post in the feed; if it isn't on screen
    // (older than what's loaded), the dismiss alone is fine.
    requestAnimationFrame(() => {
      const el = document.getElementById(`post-${postId}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Brief outline flash so the user can pick the right card after the
      // scroll lands.
      el.classList.add('hai-highlight-flash')
      setTimeout(() => el.classList.remove('hai-highlight-flash'), 1800)
    })
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
          {items.length}
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

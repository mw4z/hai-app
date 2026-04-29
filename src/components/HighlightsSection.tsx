'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'
import { FiX, FiStar } from 'react-icons/fi'
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

const SEEN_KEY = 'hai_highlights_seen_v1'

interface Props {
  items: HighlightItemPayload[]
  /** When true, the section auto-opens the modal once per device. */
  autoOpenForFirstTime?: boolean
}

export default function HighlightsSection({ items, autoOpenForFirstTime = true }: Props) {
  const { t } = useLanguage()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  // Auto-open once per device for first-time users. Storing the flag in
  // localStorage avoids re-opening on every feed visit; we don't gate
  // on user.id because the experience is per-device, not per-account.
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

  // Hide section entirely when there's nothing eligible — spec rule.
  if (items.length === 0) return null

  function go(postId: string) {
    setOpen(false)
    router.push(`/post/${postId}`)
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
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
          data-overlay="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
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
            <div className="flex-1 overflow-y-auto overscroll-y-contain">
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((it) => {
                  const bk = badgeKey(it.badge)
                  const icon = CATEGORY_ICON[it.category] || '💬'
                  return (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => go(it.id)}
                        className="w-full text-start flex gap-3 px-4 py-3 active:bg-gray-50 dark:active:bg-gray-800"
                      >
                        <div className="text-2xl flex-shrink-0 leading-none mt-0.5">{icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate flex-1">
                              {it.title}
                            </p>
                            {bk && (
                              <span
                                className={
                                  it.badge === 'pinned'
                                    ? 'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                    : it.badge === 'important'
                                      ? 'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                      : 'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                }
                              >
                                {t(bk)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                            {it.body}
                          </p>
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

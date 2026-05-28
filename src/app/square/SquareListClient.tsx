'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FiPlus, FiArrowRight, FiArrowLeft } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { HaiSpinner } from '@/components/HaiLoader'
import SquareThreadCard from '@/components/square/SquareThreadCard'
import type { PublicSquareThread } from '@/lib/square/serializeThread'

interface Props {
  initialThreads: PublicSquareThread[]
  hasMore: boolean
  neighborhoodName: string
}

/**
 * Square list screen. Header (title + subtitle + neighborhood),
 * floating "ابدأ نقاشًا" CTA, vertical thread list, paginated
 * load-more. Empty state guides the user to start the first thread.
 */
export default function SquareListClient({ initialThreads, hasMore: initialHasMore, neighborhoodName }: Props) {
  const { t, lang } = useLanguage()
  const router = useRouter()

  const [threads, setThreads] = useState<PublicSquareThread[]>(initialThreads)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, setLoadingMore] = useState(false)

  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/square?offset=${threads.length}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      const next: PublicSquareThread[] = Array.isArray(data?.threads) ? data.threads : []
      setThreads((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...next.filter((p) => !seen.has(p.id))]
      })
      setHasMore(!!data.hasMore)
    } catch {
      // Silent; user can tap "load more" again.
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-[640px] mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <button
              type="button"
              onClick={() => router.back()}
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-700"
              aria-label={lang === 'en' ? 'Back' : 'رجوع'}
            >
              {lang === 'en' ? <FiArrowLeft className="w-5 h-5" /> : <FiArrowRight className="w-5 h-5" />}
            </button>
            <h1 className="text-[18px] font-extrabold text-gray-900 dark:text-white">{t('square_page_title')}</h1>
          </div>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed">{t('square_page_subtitle')}</p>
          {neighborhoodName && (
            <p className="text-[11.5px] text-gray-400 dark:text-gray-500 mt-1">
              {lang === 'en' ? `In ${neighborhoodName}` : `في حي ${neighborhoodName}`}
            </p>
          )}
        </div>
      </div>

      <div
        className="max-w-[640px] mx-auto px-4 py-4 space-y-2.5"
        style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 7rem)' }}
      >
        {threads.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-3" aria-hidden>🗣️</p>
            <p className="text-gray-700 dark:text-gray-200 font-bold text-lg mb-1.5">{t('square_empty_title')}</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed max-w-xs mx-auto">{t('square_empty_body')}</p>
            <Link
              href="/square/new"
              className="inline-flex items-center gap-2 mt-6 px-5 py-3 rounded-2xl bg-primary-600 text-white text-sm font-bold active:scale-95 transition-transform"
            >
              <FiPlus className="w-4 h-4" />
              {t('square_start_cta')}
            </Link>
          </div>
        ) : (
          <>
            {threads.map((th) => (
              <SquareThreadCard key={th.id} thread={th} />
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-3 text-sm text-primary-600 dark:text-primary-300 font-semibold bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 active:scale-[0.99] transition-transform disabled:opacity-50"
              >
                {loadingMore ? <span className="inline-flex items-center justify-center"><HaiSpinner /></span> : (lang === 'en' ? 'Load more' : 'المزيد')}
              </button>
            )}
          </>
        )}
      </div>

      {/* Floating "Start a discussion" — primary CTA. Sits above the
          bottom nav (which renders on /square per BottomNav's
          SHOW_BOTTOM_NAV_ON allow-list). */}
      {threads.length > 0 && (
        <Link
          href="/square/new"
          className="fixed end-4 z-20 flex items-center gap-2 px-5 py-3 rounded-full bg-primary-600 text-white text-sm font-bold shadow-lg active:scale-95 transition-transform"
          style={{ bottom: 'calc(var(--hai-safe-bottom, 0px) + 5rem)' }}
        >
          <FiPlus className="w-4 h-4" />
          {t('square_start_cta')}
        </Link>
      )}
    </main>
  )
}

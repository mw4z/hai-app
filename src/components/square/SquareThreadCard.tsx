'use client'

import Link from 'next/link'
import { FiMessageCircle, FiUsers } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { fullName } from '@/lib/displayName'
import type { PublicSquareThread } from '@/lib/square/serializeThread'
import SquareTypeBadge from './SquareTypeBadge'

interface Props {
  thread: PublicSquareThread
}

/** Square list row. Pinned badge on top, type pill, title (one line),
 *  body preview (two lines), author + replies/follower counts. Tap
 *  opens /square/[id]. */
export default function SquareThreadCard({ thread }: Props) {
  const { t, lang } = useLanguage()

  const author = fullName(thread.author) || thread.author.name || (lang === 'en' ? 'Anonymous' : 'مجهول')

  // Relative time — light formatting, no library. Anything older than
  // 7 days falls back to a short locale date. Kept inline (one row,
  // formatted on every render) since the list is small.
  const ago = relativeAgo(thread.lastActivityAt, lang)

  return (
    <Link
      href={`/square/${thread.id}`}
      className="block bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {thread.isPinned && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200">
            <span aria-hidden>📌</span>
            <span>{t('square_pinned_badge')}</span>
          </span>
        )}
        <SquareTypeBadge type={thread.type} />
        <span className="text-[11px] text-gray-400 dark:text-gray-500 ms-auto">{ago}</span>
      </div>
      <h3 className="text-[15px] font-bold text-gray-900 dark:text-white leading-snug mb-1 line-clamp-1">
        {thread.title}
      </h3>
      {thread.body && (
        <p className="text-[13px] text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-2 mb-2">
          {thread.body}
        </p>
      )}
      <div className="flex items-center gap-3 text-[12px] text-gray-500 dark:text-gray-400">
        <span className="truncate">{author}</span>
        <span className="inline-flex items-center gap-1">
          <FiMessageCircle className="w-3.5 h-3.5" />
          {thread.replyCount}
        </span>
        <span className="inline-flex items-center gap-1">
          <FiUsers className="w-3.5 h-3.5" />
          {thread.followerCount}
        </span>
      </div>
    </Link>
  )
}

function relativeAgo(iso: string, lang: string): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const diff = Date.now() - then
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return lang === 'en' ? 'just now' : 'الآن'
  if (diff < hour) {
    const m = Math.floor(diff / minute)
    return lang === 'en' ? `${m}m` : `قبل ${m} د`
  }
  if (diff < day) {
    const h = Math.floor(diff / hour)
    return lang === 'en' ? `${h}h` : `قبل ${h} س`
  }
  if (diff < 7 * day) {
    const d = Math.floor(diff / day)
    return lang === 'en' ? `${d}d` : `قبل ${d} يوم`
  }
  try {
    return new Date(then).toLocaleDateString(lang === 'en' ? 'en-US' : 'ar-SA', {
      month: 'short', day: 'numeric',
    })
  } catch {
    return ''
  }
}

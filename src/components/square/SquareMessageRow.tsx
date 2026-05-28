'use client'

import { useLanguage } from '@/hooks/useLanguage'
import { fullName } from '@/lib/displayName'
import type { PublicSquareMessage } from '@/lib/square/serializeMessage'

/** One row in the Square message list. Plain text body — no media,
 *  no reactions, no reply UI in MVP. The pinned badge / kind label
 *  ride along when they apply; otherwise the row is just
 *  "author · time → body". Pinned and kind metadata are surfaced as
 *  small chips so the row stays calm and chat-like. */
export default function SquareMessageRow({ message }: { message: PublicSquareMessage }) {
  const { lang } = useLanguage()
  const author = fullName(message.author) || message.author.name || (lang === 'en' ? 'Anonymous' : 'مجهول')
  const time = formatTime(message.createdAt, lang)

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3.5">
      <div className="flex items-center gap-2 mb-1.5 text-[12px] text-gray-500 dark:text-gray-400 flex-wrap">
        <span className="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[55%]">{author}</span>
        <span>·</span>
        <span>{time}</span>
        {message.isPinned && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200">
            <span aria-hidden>📌</span>
            <span>{lang === 'en' ? 'Pinned' : 'مثبّت'}</span>
          </span>
        )}
      </div>
      <p className="text-[14.5px] text-gray-900 dark:text-white leading-relaxed whitespace-pre-wrap">{message.body}</p>
    </div>
  )
}

function formatTime(iso: string, lang: string): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const diff = Date.now() - then
  const m = 60 * 1000, h = 60 * m, d = 24 * h
  if (diff < m) return lang === 'en' ? 'just now' : 'الآن'
  if (diff < h) return lang === 'en' ? `${Math.floor(diff / m)}m` : `قبل ${Math.floor(diff / m)} د`
  if (diff < d) return lang === 'en' ? `${Math.floor(diff / h)}h` : `قبل ${Math.floor(diff / h)} س`
  if (diff < 7 * d) return lang === 'en' ? `${Math.floor(diff / d)}d` : `قبل ${Math.floor(diff / d)} يوم`
  try {
    return new Date(then).toLocaleDateString(lang === 'en' ? 'en-US' : 'ar-SA', { month: 'short', day: 'numeric' })
  } catch { return '' }
}

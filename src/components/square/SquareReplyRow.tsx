'use client'

import { useLanguage } from '@/hooks/useLanguage'
import { fullName } from '@/lib/displayName'
import type { PublicSquareReply } from '@/lib/square/serializeThread'

/** A single reply row inside the thread detail. Plain text body (no
 *  attachments by Square policy), author name, timestamp. "Helpful"
 *  pill renders when isMarkedHelpful is true — the UI to TOGGLE it
 *  ships in Phase 2; the field is wired here so the badge already
 *  appears for any reply where a Phase 2 mod has marked it. */
export default function SquareReplyRow({ reply }: { reply: PublicSquareReply }) {
  const { lang } = useLanguage()
  const author = fullName(reply.author) || reply.author.name || (lang === 'en' ? 'Anonymous' : 'مجهول')
  const time = formatTime(reply.createdAt, lang)

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3.5">
      <div className="flex items-center gap-2 mb-1.5 text-[12px] text-gray-500 dark:text-gray-400">
        <span className="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[60%]">{author}</span>
        <span>·</span>
        <span>{time}</span>
        {reply.isMarkedHelpful && (
          <span className="inline-flex items-center gap-1 ms-auto px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
            <span aria-hidden>✅</span>
            <span>{lang === 'en' ? 'Helpful' : 'إجابة مفيدة'}</span>
          </span>
        )}
      </div>
      <p className="text-[14px] text-gray-900 dark:text-white leading-relaxed whitespace-pre-wrap">{reply.body}</p>
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

'use client'

import { useLanguage } from '@/hooks/useLanguage'
import type { TranslationKey } from '@/lib/i18n'
import type { PublicSquareThread } from '@/lib/square/serializeThread'

/** Small pill that renders the Square thread's type (سؤال / ملاحظة /
 *  نقاش / تنبيه خفيف). Used in list cards + the detail header. Colors
 *  are subtle — the badge is informational, not a CTA. */
const STYLE: Record<PublicSquareThread['type'], { bg: string; text: string; emoji: string; tKey: TranslationKey }> = {
  QUESTION:    { bg: 'bg-sky-50 dark:bg-sky-900/30',          text: 'text-sky-700 dark:text-sky-300',          emoji: '❓', tKey: 'square_type_question' },
  NOTE:        { bg: 'bg-amber-50 dark:bg-amber-900/30',      text: 'text-amber-700 dark:text-amber-300',      emoji: '📝', tKey: 'square_type_note' },
  DISCUSSION:  { bg: 'bg-emerald-50 dark:bg-emerald-900/30',  text: 'text-emerald-700 dark:text-emerald-300',  emoji: '💬', tKey: 'square_type_discussion' },
  LIGHT_ALERT: { bg: 'bg-rose-50 dark:bg-rose-900/30',        text: 'text-rose-700 dark:text-rose-300',        emoji: '⚡', tKey: 'square_type_light_alert' },
}

export default function SquareTypeBadge({ type }: { type: PublicSquareThread['type'] }) {
  const { t } = useLanguage()
  const s = STYLE[type] ?? STYLE.DISCUSSION
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.bg} ${s.text}`}>
      <span aria-hidden>{s.emoji}</span>
      <span>{t(s.tKey)}</span>
    </span>
  )
}

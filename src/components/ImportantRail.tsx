'use client'

/**
 * "المهم في الحي" rail — top-of-feed strip surfacing the few items that
 * deserve to outrank fresh marketplace/services noise:
 *   • pinned mod posts
 *   • HIGH/CRITICAL priority NEIGHBORHOOD_REPORTS (last 7 days)
 *   • EVENTS (last 14 days; Phase 1 will narrow to upcoming via
 *     `eventStartAt`)
 *
 * Items are computed server-side in feed/page.tsx and passed in as a
 * prop — no fetch on mount. Each card is a SUMMARY: tapping it scrolls
 * to the matching PostCard in the regular feed list (anchored via
 * `id="post-<id>"`). We deliberately don't dedupe — the rail is a
 * highlight surface, the feed list is the full record.
 *
 * Dismiss state lives in localStorage as a comma-list of post IDs;
 * dismissals expire after 7 days so a re-pinned item resurfaces.
 */

import { useEffect, useMemo, useState } from 'react'
import { FiAlertTriangle, FiBookmark, FiCalendar, FiX } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'

export interface ImportantItem {
  id: string
  title: string
  category: string
  priority: string | null
  isPinned: boolean
  createdAt: string
  author: {
    id: string
    name: string | null
    lastName: string | null
    avatarUrl: string | null
  }
}

const STORAGE_KEY = 'hai_important_dismissed_v1'
const DISMISS_TTL_MS = 7 * 24 * 3600_000

interface DismissEntry { id: string; at: number }

function readDismissed(): DismissEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DismissEntry[]
    const now = Date.now()
    return parsed.filter(e => now - e.at < DISMISS_TTL_MS)
  } catch { return [] }
}

function writeDismissed(entries: DismissEntry[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) } catch { /* */ }
}

function iconFor(item: ImportantItem) {
  if (item.isPinned) return <FiBookmark className="w-4 h-4" />
  if (item.category === 'EVENTS') return <FiCalendar className="w-4 h-4" />
  return <FiAlertTriangle className="w-4 h-4" />
}

function labelFor(item: ImportantItem, lang: string): string {
  if (item.isPinned) return lang === 'en' ? 'Pinned' : lang === 'ur' ? 'پن کیا گیا' : 'مُثبّت'
  if (item.priority === 'CRITICAL') {
    return lang === 'en' ? 'Critical' : lang === 'ur' ? 'بہت اہم' : 'عاجل'
  }
  if (item.category === 'NEIGHBORHOOD_REPORTS') {
    return lang === 'en' ? 'Neighborhood' : lang === 'ur' ? 'محلہ' : 'بلاغ حي'
  }
  if (item.category === 'EVENTS') {
    return lang === 'en' ? 'Event' : lang === 'ur' ? 'تقریب' : 'فعالية'
  }
  return lang === 'en' ? 'Important' : lang === 'ur' ? 'اہم' : 'مهم'
}

function tone(item: ImportantItem): 'red' | 'amber' | 'sky' | 'primary' {
  if (item.priority === 'CRITICAL') return 'red'
  if (item.isPinned) return 'primary'
  if (item.category === 'EVENTS') return 'sky'
  return 'amber'
}

const TONE_CLASSES: Record<'red' | 'amber' | 'sky' | 'primary', string> = {
  red:     'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
  amber:   'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
  sky:     'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300',
  primary: 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300',
}

export default function ImportantRail({ items }: { items: ImportantItem[] }) {
  const { lang } = useLanguage()
  const [dismissed, setDismissed] = useState<DismissEntry[]>([])

  // Hydrate dismissed IDs once. We start with [] on SSR so the rail
  // renders the same on server and first client paint (no hydration
  // mismatch); the filter runs after hydrate.
  useEffect(() => { setDismissed(readDismissed()) }, [])

  const dismissedIds = useMemo(() => new Set(dismissed.map(e => e.id)), [dismissed])
  const visible = items.filter(it => !dismissedIds.has(it.id))

  if (visible.length === 0) return null

  function dismiss(id: string) {
    const next = [...dismissed.filter(e => e.id !== id), { id, at: Date.now() }]
    setDismissed(next)
    writeDismissed(next)
  }

  function jumpToPost(id: string) {
    if (typeof document === 'undefined') return
    const el = document.getElementById(`post-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // Brief highlight pulse — CSS hook expected to fade.
    el.classList.add('hai-important-pulse')
    setTimeout(() => el.classList.remove('hai-important-pulse'), 1800)
  }

  return (
    <section
      aria-label={lang === 'en' ? 'Important in your neighborhood' : 'المهم في الحي'}
      className="px-4 pt-3"
    >
      <h2 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
        <span aria-hidden="true">📌</span>
        <span>
          {lang === 'en' ? 'Important in your neighborhood'
            : lang === 'ur' ? 'محلے میں اہم'
            : 'المهم في الحي'}
        </span>
      </h2>
      <ul className="space-y-2">
        {visible.map(item => {
          const klass = TONE_CLASSES[tone(item)]
          return (
            <li
              key={item.id}
              className={`relative rounded-2xl border ${klass} active:scale-[0.99] transition-transform`}
            >
              <button
                type="button"
                onClick={() => jumpToPost(item.id)}
                className="w-full text-start px-3 py-2.5 flex items-center gap-2"
              >
                <span className="flex-shrink-0">{iconFor(item)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wide opacity-80">
                    {labelFor(item, lang)}
                  </span>
                  <span
                    dir="auto"
                    className="block text-sm font-semibold text-gray-900 dark:text-white truncate"
                  >
                    {item.title}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); dismiss(item.id) }}
                  className="flex-shrink-0 p-1 -mx-1 opacity-70 active:opacity-100"
                  aria-label={lang === 'en' ? 'Dismiss' : 'إخفاء'}
                >
                  <FiX className="w-3.5 h-3.5" />
                </button>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

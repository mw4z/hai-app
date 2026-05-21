'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FiSearch, FiMapPin, FiShoppingBag, FiAlertTriangle, FiTag, FiX } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { directoryUIVisible } from '@/lib/places/featureFlag'

/**
 * Quick-start guidance card pinned near the top of /feed.
 *
 * Older / first-time users tend to bounce off the app because they
 * see a feed of posts without knowing where to ASK, SELL, or
 * REPORT. The 2×2 action grid here teaches the model in one glance:
 * "you can do these four things, tap one and we'll route you."
 *
 * UI-only — no schema, no API, no flag flips. Each button only
 * navigates to an existing route.
 *
 *   1. Ask                    → /ask
 *   2. Find a service / place → /directory (if flag visible) else /ask
 *   3. Buy / sell             → /post/new?category=MARKETPLACE
 *   4. Report a problem       → /post/new?category=NEIGHBORHOOD_REPORTS
 *
 * Dismiss is permanent per device. The key is versioned so a
 * future significant redesign can re-show the card by bumping the
 * suffix (v1 → v2). No server sync, no profile setting — clearing
 * site storage is the only way to bring it back at v1.
 */

const DISMISS_KEY = 'hai:home-action-card-dismissed-v1'

export default function HomeActionCard() {
  const router = useRouter()
  const { t } = useLanguage()

  // SSR-safe gate: server render returns null so the card never
  // flashes for users who already dismissed it. localStorage is
  // read once on mount and the visible flip happens in the same
  // useEffect tick after hydration. Any truthy value at DISMISS_KEY
  // means "user has dismissed at v1" — permanent until they clear
  // site storage or we bump to v2.
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    let dismissed = false
    try {
      if (localStorage.getItem(DISMISS_KEY)) dismissed = true
    } catch {
      // localStorage unavailable (private mode etc.) — show the card.
    }
    if (!dismissed) setVisible(true)
  }, [])

  if (!visible) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignore — at worst the card reappears next session
    }
    setVisible(false)
  }

  // Route resolved at click time so a flag flip between page load
  // and tap is honored (the flag is a build-time literal in the
  // client bundle, so this is mostly defensive).
  function findRoute(): string {
    return directoryUIVisible() ? '/directory' : '/ask'
  }

  const actions: {
    key: string
    title: string
    help: string
    Icon: typeof FiSearch
    /** Tailwind classes for the icon tile background. */
    tileBg: string
    iconColor: string
    route: () => string
  }[] = [
    {
      key: 'ask',
      title: t('home_action_ask_title'),
      help: t('home_action_ask_help'),
      Icon: FiSearch,
      tileBg: 'bg-sky-100 dark:bg-sky-900/30',
      iconColor: 'text-sky-600 dark:text-sky-300',
      route: () => '/ask',
    },
    {
      key: 'find',
      title: t('home_action_find_title'),
      help: t('home_action_find_help'),
      Icon: FiMapPin,
      tileBg: 'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor: 'text-emerald-600 dark:text-emerald-300',
      route: findRoute,
    },
    {
      key: 'sell',
      title: t('home_action_sell_title'),
      help: t('home_action_sell_help'),
      Icon: FiShoppingBag,
      tileBg: 'bg-amber-100 dark:bg-amber-900/30',
      iconColor: 'text-amber-600 dark:text-amber-300',
      route: () => '/post/new?category=MARKETPLACE',
    },
    {
      key: 'report',
      title: t('home_action_report_title'),
      help: t('home_action_report_help'),
      Icon: FiAlertTriangle,
      tileBg: 'bg-rose-100 dark:bg-rose-900/30',
      iconColor: 'text-rose-600 dark:text-rose-300',
      route: () => '/post/new?category=NEIGHBORHOOD_REPORTS',
    },
  ]

  return (
    <section
      aria-label={t('home_actions_title')}
      className="mx-4 mt-3 mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-3.5"
    >
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-bold text-gray-900 dark:text-white leading-tight">
            {t('home_actions_title')}
          </h2>
          <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
            {t('home_actions_subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('home_actions_dismiss')}
          className="flex-shrink-0 w-8 h-8 -mt-1 -me-1 flex items-center justify-center rounded-full text-gray-400 dark:text-gray-500 active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
        >
          <FiX className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => router.push(a.route())}
            aria-label={`${a.title} — ${a.help}`}
            className="text-start min-h-[72px] flex items-center gap-3 rounded-2xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700/60 p-3 active:scale-[0.98] active:bg-gray-100 dark:active:bg-gray-900 transition-transform"
          >
            <span
              className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${a.tileBg}`}
              aria-hidden
            >
              <a.Icon className={`w-5 h-5 ${a.iconColor}`} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-bold text-gray-900 dark:text-white leading-tight truncate">
                {a.title}
              </span>
              <span className="block text-[11px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5 line-clamp-2">
                {a.help}
              </span>
            </span>
          </button>
        ))}
      </div>

      {/* Offers — full-width CTA below the grid so users discover that
          the neighborhood has deals and exactly where to find them
          (سوق الحي / the offer-only Market). Amber + tag mirror the
          composer's "mark as offer" toggle and the feed's Offers chip. */}
      <button
        type="button"
        onClick={() => router.push('/market')}
        aria-label={`${t('home_action_offers_title')} — ${t('home_action_offers_help')}`}
        className="mt-2 w-full text-start min-h-[60px] flex items-center gap-3 rounded-2xl border border-amber-200/80 dark:border-amber-800/50 bg-gradient-to-l from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-900/30 p-3 active:scale-[0.98] transition-transform"
      >
        <span
          className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center bg-amber-500/15"
          aria-hidden
        >
          <FiTag className="w-5 h-5 text-amber-600 dark:text-amber-300" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-bold text-amber-900 dark:text-amber-200 leading-tight truncate">
            🏷️ {t('home_action_offers_title')}
          </span>
          <span className="block text-[11px] text-amber-700/80 dark:text-amber-300/70 leading-snug mt-0.5 line-clamp-1">
            {t('home_action_offers_help')}
          </span>
        </span>
      </button>
    </section>
  )
}

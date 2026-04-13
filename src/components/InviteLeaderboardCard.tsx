'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FiShare2, FiAward } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'

interface Leader {
  userId: string
  name: string | null
  qualifiedCount: number
  badgeTier: number
}

const TIER_EMOJI = ['🏘️', '🥉', '🥈', '🥇', '💎']

/**
 * Small card showing the top 3 inviters in the user's neighborhood.
 * Only renders when there are at least 2 active inviters — otherwise it
 * feels empty/sad. Doubles as a density-engine nudge.
 */
export default function InviteLeaderboardCard() {
  const { lang } = useLanguage()
  const dn = (ar: string, en: string) => (lang === 'en' ? en : ar)
  const [leaders, setLeaders] = useState<Leader[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/invites/leaderboard?scope=neighborhood&limit=3')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        setLeaders(Array.isArray(d?.leaders) ? d.leaders : [])
      })
      .catch(() => {
        if (!cancelled) setLeaders([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!leaders || leaders.length < 2) return null

  return (
    <div className="px-4 pt-3">
      <Link
        href="/profile"
        className="block bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/10 rounded-2xl border border-primary-200 dark:border-primary-800/30 p-4 active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
            <FiAward className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-primary-700 dark:text-primary-300">
              {dn('أفضل من يدعو جيرانه', 'Top neighbors growing Hai')}
            </p>
            <p className="text-[10px] text-primary-600/70 dark:text-primary-400/70">
              {dn('في حيّك هذا الأسبوع', 'In your neighborhood this week')}
            </p>
          </div>
          <FiShare2 className="w-4 h-4 text-primary-600 flex-shrink-0" />
        </div>

        <div className="space-y-1.5">
          {leaders.slice(0, 3).map((l, idx) => {
            const tier = TIER_EMOJI[l.badgeTier] || '🏘️'
            const rankEmoji = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'
            return (
              <div
                key={l.userId}
                className="flex items-center gap-2 bg-white/60 dark:bg-gray-800/40 rounded-xl px-3 py-2"
              >
                <span className="text-base flex-shrink-0">{rankEmoji}</span>
                <span className="flex-1 text-sm font-semibold text-gray-800 dark:text-white truncate">
                  {l.name || dn('جار', 'Neighbor')}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {l.qualifiedCount}
                </span>
                <span className="text-sm">{tier}</span>
              </div>
            )
          })}
        </div>

        <p className="text-[11px] text-primary-700 dark:text-primary-300 mt-3 text-center font-semibold">
          {dn('شارك كودك واحصل على +50 نقطة', 'Share your code, earn +50 rep')}
        </p>
      </Link>
    </div>
  )
}

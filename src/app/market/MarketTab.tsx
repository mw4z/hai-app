'use client'

import Link from 'next/link'
import { hapticLight } from '@/lib/haptic'

/**
 * Client wrapper around a market tab link — fires a light haptic tick
 * on tap for a more responsive feel. Kept deliberately minimal so the
 * parent server component stays a server component.
 */
export default function MarketTab({
  href,
  active,
  icon,
  label,
}: {
  href: string
  active: boolean
  icon: string
  label: string
}) {
  return (
    <Link
      href={href}
      onClick={() => { if (!active) hapticLight() }}
      className={`flex items-center gap-1.5 whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-medium flex-shrink-0 transition-all ${
        active
          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25 glow-tab'
          : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-white/[0.08]'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </Link>
  )
}

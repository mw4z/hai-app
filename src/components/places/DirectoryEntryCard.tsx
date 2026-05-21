'use client'

import Link from 'next/link'
import { useLanguage } from '@/hooks/useLanguage'

interface Props {
  variant?: 'card' | 'chip'
  /** When the surrounding surface is in cross-neighborhood browse
   *  mode (feed reading another nbhd's posts), pass that nbhd id
   *  here so the directory link inherits the browse context and
   *  shows the same neighborhood's places. */
  browseNeighborhoodId?: string | null
}

/** Small CTA card linking to /directory. Gated by callers on
 *  NEXT_PUBLIC_DIRECTORY_ENABLED — when the env flag is unset
 *  (default), this never renders.
 *
 *  Used in: feed (above the post list), /ask (chip in the intent
 *  area), profile (compact section). */
export default function DirectoryEntryCard({
  variant = 'card',
  browseNeighborhoodId = null,
}: Props) {
  const { lang } = useLanguage()
  // Read the public flag inline — env access in client components
  // is inlined at build time for NEXT_PUBLIC_* vars only.
  if (process.env.NEXT_PUBLIC_DIRECTORY_ENABLED !== '1') return null

  const href = browseNeighborhoodId
    ? `/directory?neighborhood=${encodeURIComponent(browseNeighborhoodId)}`
    : '/directory'

  const title =
    lang === 'en' ? 'Neighborhood Directory'
    : lang === 'ur' ? 'محلے کی ڈائریکٹری'
    : 'دليل الحي'
  const subtitle =
    lang === 'en' ? 'Discover places and services near you.'
    : lang === 'ur' ? 'اپنے محلے کی جگہیں دریافت کریں۔'
    : 'اكتشف الأماكن والخدمات القريبة في حيّك.'

  if (variant === 'chip') {
    return (
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800/60 text-xs font-semibold text-primary-700 dark:text-primary-300 active:scale-95 transition-transform"
      >
        <span aria-hidden>🏘️</span>
        <span>{title}</span>
      </Link>
    )
  }

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-2xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800/60 px-4 py-3 active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center gap-2.5">
        <span className="text-xl" aria-hidden>🏘️</span>
        <div className="leading-tight">
          <p className="text-sm font-bold text-primary-900 dark:text-primary-200">{title}</p>
          <p className="text-[11px] text-primary-700/80 dark:text-primary-300/70">{subtitle}</p>
        </div>
      </div>
      <span className="text-primary-600 dark:text-primary-400 text-sm">›</span>
    </Link>
  )
}

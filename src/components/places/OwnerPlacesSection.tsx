'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/hooks/useLanguage'
import type { PublicPlace } from '@/lib/places/serialize'
import { getCategoryMeta } from '@/lib/places/categories'

/** "الأماكن التي تديرها" section for the user's own profile.
 *  Self-gated on NEXT_PUBLIC_DIRECTORY_ENABLED — returns null when
 *  the public flag is off, so the section is invisible in pre-
 *  launch deploys regardless of whether the user has claimed
 *  places server-side. Hides itself when the claimed array is
 *  empty so we never render an empty card. */
export default function OwnerPlacesSection() {
  const { lang } = useLanguage()
  const enabled = process.env.NEXT_PUBLIC_DIRECTORY_ENABLED === '1'

  const [places, setPlaces] = useState<PublicPlace[] | null>(null)

  useEffect(() => {
    if (!enabled) return
    let aborted = false
    fetch('/api/directory/mine')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (aborted || !d) return
        setPlaces(Array.isArray(d.claimed) ? d.claimed : [])
      })
      .catch(() => { /* hide on error — keeps profile resilient */ })
    return () => { aborted = true }
  }, [enabled])

  if (!enabled) return null
  if (!places || places.length === 0) return null

  const title =
    lang === 'en' ? 'Places you manage'
    : lang === 'ur' ? 'آپ کے زیر انتظام جگہیں'
    : 'الأماكن التي تديرها'

  return (
    <div className="mx-4 mt-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 px-1 mb-1.5">
        {title}
      </p>
      <div className="space-y-1.5">
        {places.map((p) => {
          const cat = getCategoryMeta(p.category)
          return (
            <Link
              key={p.id}
              href={`/directory/${p.id}`}
              className="flex items-center gap-2.5 px-3 py-2.5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 active:bg-gray-50 dark:active:bg-gray-700"
            >
              <span className="text-lg" aria-hidden>{cat.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                  {lang === 'en' ? cat.labelEn : lang === 'ur' ? cat.labelUr : cat.labelAr}
                </p>
              </div>
              <span className="text-gray-300 dark:text-gray-500 text-sm" aria-hidden>›</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

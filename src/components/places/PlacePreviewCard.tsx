'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/hooks/useLanguage'
import { getCategoryMeta } from '@/lib/places/categories'
import PlaceStatusBadge from '@/components/places/PlaceStatusBadge'
import PlacePill from '@/components/places/PlacePill'

/**
 * Compact card rendered below a SmartText body whenever the body
 * contains a /directory/<id> link. Self-fetches the place from
 * /api/directory/[id]/preview, which enforces directory visibility
 * + neighborhood scoping; on 404 the card flips to an "unavailable"
 * state so removed/rejected/out-of-scope places don't leak.
 *
 * To avoid N+1 fetches when scrolling a long feed full of the
 * same place link, fetches are de-duplicated through a module-
 * level cache keyed by place id. Each unique id is fetched once
 * per session.
 */

interface PreviewPlace {
  id: string
  name: string
  category: string
  status: string
  addressText: string | null
  mapUrl: string | null
  openingHours: string | null
  manualStatus: string | null
  manualStatusUntil: string | null
  addedByCommunity: boolean
  claimedByUser: {
    id: string
    name: string | null
    avatarUrl: string | null
    providerStatus: string | null
  } | null
}

type FetchState =
  | { kind: 'loading' }
  | { kind: 'ok'; place: PreviewPlace }
  | { kind: 'unavailable' }

// Shared in-memory cache. Keys are place ids; values are the
// in-flight promise (during fetch) or the resolved FetchState.
// Survives mount/unmount of individual cards within a session;
// dropped on full page reload (which is fine — the visibility
// gates run again then).
const cache = new Map<string, Promise<FetchState>>()

function fetchPlace(id: string): Promise<FetchState> {
  const existing = cache.get(id)
  if (existing) return existing
  const p = (async (): Promise<FetchState> => {
    try {
      const res = await fetch(`/api/directory/${encodeURIComponent(id)}/preview`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!res.ok) return { kind: 'unavailable' }
      const data = await res.json()
      if (!data?.id) return { kind: 'unavailable' }
      return { kind: 'ok', place: data as PreviewPlace }
    } catch {
      return { kind: 'unavailable' }
    }
  })()
  cache.set(id, p)
  return p
}

export default function PlacePreviewCard({ placeId }: { placeId: string }) {
  const { lang } = useLanguage()
  const [state, setState] = useState<FetchState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetchPlace(placeId).then((s) => {
      if (!cancelled) setState(s)
    })
    return () => {
      cancelled = true
    }
  }, [placeId])

  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  // ── Loading skeleton ──
  if (state.kind === 'loading') {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 mt-2 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-2.5 w-20 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
      </div>
    )
  }

  // ── Unavailable / removed / unauthorized ──
  if (state.kind === 'unavailable') {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 mt-2 text-[12px] text-gray-500 dark:text-gray-400">
        📍 هذا المكان غير متاح حاليًا
      </div>
    )
  }

  // ── Loaded preview ──
  const { place } = state
  const cat = getCategoryMeta(place.category as any)
  const categoryLabel =
    lang === 'en' ? cat.labelEn : lang === 'ur' ? cat.labelUr : cat.labelAr

  return (
    <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-900/15 p-3 mt-2">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1.5">
        {tr('Attached from directory', 'مرفق من دليل الحي', 'ڈائرکٹری سے منسلک')}
      </span>
      <Link
        href={`/directory/${place.id}`}
        className="flex items-start gap-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3 active:scale-[0.99] transition-transform"
      >
        <span className="text-2xl leading-none flex-shrink-0" aria-hidden>
          {cat.emoji}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-start gap-2">
            <span className="text-[14px] font-bold text-gray-900 dark:text-white flex-1 truncate">
              {place.name}
            </span>
            <PlaceStatusBadge status={place.status as any} source={(place as any).source} />
          </span>
          <span className="block text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            {categoryLabel}
            {place.addressText ? ` · ${place.addressText}` : ''}
          </span>
          <span className="flex items-center gap-2 mt-1.5 flex-wrap">
            <PlacePill place={place} size="sm" />
            <span className="text-[11.5px] font-semibold text-emerald-700 dark:text-emerald-300 ms-auto rtl:ms-0 rtl:me-auto">
              عرض المكان ←
            </span>
          </span>
        </span>
      </Link>
    </div>
  )
}

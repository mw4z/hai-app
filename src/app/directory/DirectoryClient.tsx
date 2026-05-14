'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import type { PlaceCategory } from '@prisma/client'
import { useLanguage } from '@/hooks/useLanguage'
import type { PublicPlace } from '@/lib/places/serialize'
import PlaceCard from '@/components/places/PlaceCard'
import CategoryChips from '@/components/places/CategoryChips'

interface Props {
  initialPlaces: PublicPlace[]
}

/** Directory list client. Server seeds with the first 30 visible
 *  places in the user's neighborhood; this component handles
 *  search-as-you-type + category filter. For non-empty filters
 *  we hit /api/directory so the result respects the same
 *  visibility + permission rules as the SSR slice. */
export default function DirectoryClient({ initialPlaces }: Props) {
  const { lang } = useLanguage()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<PlaceCategory | null>(null)
  const [places, setPlaces] = useState<PublicPlace[]>(initialPlaces)
  const [loading, setLoading] = useState(false)

  // Refetch when the filters actually change. Empty filters reset
  // to the SSR slice to avoid an unnecessary round trip.
  useEffect(() => {
    if (!q && !category) {
      setPlaces(initialPlaces)
      return
    }
    let aborted = false
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (category) params.set('category', category)
    fetch(`/api/directory?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (aborted) return
        setPlaces(Array.isArray(d.places) ? d.places : [])
      })
      .catch(() => {})
      .finally(() => { if (!aborted) setLoading(false) })
    return () => { aborted = true }
  }, [q, category, initialPlaces])

  const empty = !loading && places.length === 0
  const headerTitle =
    lang === 'en' ? 'Neighborhood Directory' : lang === 'ur' ? 'محلے کی ڈائریکٹری' : 'دليل الحي'
  const headerSubtitle =
    lang === 'en'
      ? 'Discover places and shops in your neighborhood.'
      : lang === 'ur'
        ? 'اپنے محلے میں جگہیں اور دکانیں دریافت کریں۔'
        : 'اكتشف الأماكن والمحلات في حيّك.'
  const placeholder =
    lang === 'en' ? "What are you looking for?" : lang === 'ur' ? 'کیا ڈھونڈ رہے ہیں؟' : 'وش تدور عليه؟'

  return (
    <main className="hai-directory-screen min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-[640px] mx-auto px-4 py-4 space-y-4">
        <header className="space-y-1 pt-2">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{headerTitle}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{headerSubtitle}</p>
        </header>

        <div className="flex items-center gap-2">
          <div className="flex-1">
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <Link
            href="/directory/new"
            className="flex-shrink-0 px-4 py-3 rounded-2xl bg-primary-600 text-white text-sm font-semibold active:scale-95 transition-transform"
          >
            +
          </Link>
        </div>

        <CategoryChips selected={category} onSelect={setCategory} />

        {loading && (
          <p className="text-center text-xs text-gray-400 py-2">
            {lang === 'en' ? 'Loading…' : 'جاري التحميل…'}
          </p>
        )}

        {empty ? (
          <div className="text-center py-12">
            <p className="text-5xl mb-3">🏘️</p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {q || category
                ? (lang === 'en' ? 'No matching places.' : 'لا توجد أماكن مطابقة.')
                : (lang === 'en' ? 'No places yet — be the first to add one.' : 'لا توجد أماكن بعد — كن أول من يضيف.')}
            </p>
            <Link
              href="/directory/new"
              className="inline-block mt-4 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold active:scale-95"
            >
              {lang === 'en' ? 'Add a place' : 'إضافة مكان'}
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5 pb-8">
            {places.map((p) => <PlaceCard key={p.id} place={p} />)}
          </div>
        )}
      </div>
    </main>
  )
}

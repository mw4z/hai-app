'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import type { PlaceCategory } from '@prisma/client'
import { useLanguage } from '@/hooks/useLanguage'
import type { PublicPlace } from '@/lib/places/serialize'
import PlaceCard from '@/components/places/PlaceCard'
import CategoryChips from '@/components/places/CategoryChips'
import DirectoryHeader from '@/components/places/DirectoryHeader'
import ContextualGuide from '@/components/ContextualGuide'

const DIRECTORY_GUIDE_STEPS = [
  {
    targetSelector: null,
    title: 'دليل الحي',
    body: 'هنا تلقى الأماكن والخدمات الثابتة داخل حيّك.',
    position: 'center' as const,
    nextLabel: 'التالي',
  },
  {
    targetSelector: '[data-guide="dir-search"]',
    title: 'ابحث بسرعة',
    body: 'صيدلية، مطعم، مغسلة، عيادة، أو محل قريب.',
    position: 'bottom' as const,
    nextLabel: 'التالي',
  },
  {
    targetSelector: '[data-guide="dir-add"]',
    title: 'أضف مكان',
    body: 'إذا تعرف مكان مفيد، أضفه ويراجعه المشرف.',
    position: 'bottom' as const,
    nextLabel: 'فهمت',
  },
]

interface Props {
  initialPlaces: PublicPlace[]
  /** True when the user is browsing another neighborhood's
   *  directory (via ?neighborhood=<id>). Hides the "Add a place"
   *  affordance and shows a banner. Server enforces the
   *  write-side restriction independently. */
  isReadOnly?: boolean
  browseNeighborhood?: { id: string; name: string; nameEn: string | null } | null
}

/** Directory list client. Server seeds with the first 30 visible
 *  places in the active neighborhood (user's own or the browsed
 *  one); this component handles search-as-you-type + category
 *  filter. For non-empty filters we hit /api/directory with the
 *  same `?neighborhood=` so the API returns the right slice. */
export default function DirectoryClient({
  initialPlaces,
  isReadOnly = false,
  browseNeighborhood = null,
}: Props) {
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
    // Carry browse-mode neighborhood through to the API so filtered
    // refetches stay scoped to the same neighborhood the SSR list
    // landed on.
    if (isReadOnly && browseNeighborhood?.id) {
      params.set('neighborhood', browseNeighborhood.id)
    }
    fetch(`/api/directory?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (aborted) return
        setPlaces(Array.isArray(d.places) ? d.places : [])
      })
      .catch(() => {})
      .finally(() => { if (!aborted) setLoading(false) })
    return () => { aborted = true }
  }, [q, category, initialPlaces, isReadOnly, browseNeighborhood?.id])

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
      <DirectoryHeader
        title={headerTitle}
        backHref={isReadOnly ? `/feed?neighborhood=${browseNeighborhood?.id ?? ''}` : '/feed'}
      />
      <div className="max-w-[640px] mx-auto px-4 py-4 space-y-4">
        {/* Browse-mode banner — tells the user they're viewing
            another neighborhood's directory in read-only mode.
            Mirrors the same affordance the feed uses on the
            equivalent state. */}
        {isReadOnly && browseNeighborhood && (
          <div className="rounded-2xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800/60 px-3 py-2.5 text-[12px] text-sky-800 dark:text-sky-200">
            {lang === 'en'
              ? `Browsing ${browseNeighborhood.nameEn ?? browseNeighborhood.name} — read only`
              : lang === 'ur'
                ? `${browseNeighborhood.name} براؤز کر رہے ہیں — صرف پڑھنے کیلئے`
                : `تتصفّح دليل حي ${browseNeighborhood.name} — قراءة فقط`}
          </div>
        )}

        <p className="text-sm text-gray-500 dark:text-gray-400 pt-1">{headerSubtitle}</p>

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
          {/* Hide "Add a place" when browsing another neighborhood —
              you can only submit to your own. Server enforces this
              independently. */}
          {!isReadOnly && (
            <Link
              href="/directory/new"
              data-guide="dir-add"
              className="flex-shrink-0 px-4 py-3 rounded-2xl bg-primary-600 text-white text-sm font-semibold active:scale-95 transition-transform"
            >
              +
            </Link>
          )}
        </div>

        <div data-guide="dir-search">
          <CategoryChips selected={category} onSelect={setCategory} />
        </div>

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
                : isReadOnly
                  ? (lang === 'en' ? 'No places in this neighborhood yet.' : 'لا توجد أماكن في هذا الحي بعد.')
                  : (lang === 'en' ? 'No places yet — be the first to add one.' : 'لا توجد أماكن بعد — كن أول من يضيف.')}
            </p>
            {!isReadOnly && (
              <Link
                href="/directory/new"
                className="inline-block mt-4 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold active:scale-95"
              >
                {lang === 'en' ? 'Add a place' : 'إضافة مكان'}
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2.5 pb-8">
            {places.map((p) => <PlaceCard key={p.id} place={p} />)}
          </div>
        )}
      </div>
      {/* Directory guide — only mount in own-neighborhood mode.
          The page itself is server-gated by directoryServerMode(),
          so reaching DirectoryClient already implies the directory
          is accessible. Read-only browse hides the "Add a place"
          affordance, so step 3 would dead-end there — skip the
          whole tour in browse mode instead. No directory flags
          are flipped or exposed here. */}
      {!isReadOnly && (
        <ContextualGuide guideId="directory" steps={DIRECTORY_GUIDE_STEPS} />
      )}
    </main>
  )
}

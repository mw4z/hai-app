'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { FiSliders, FiX } from 'react-icons/fi'
import type { PlaceCategory } from '@prisma/client'
import { useLanguage } from '@/hooks/useLanguage'
import type { PublicPlace } from '@/lib/places/serialize'
import PlaceCard from '@/components/places/PlaceCard'
import ServiceContactsPanel from '@/components/places/ServiceContactsPanel'
import CategoryChips from '@/components/places/CategoryChips'
import DirectoryHeader from '@/components/places/DirectoryHeader'
import ContextualGuide from '@/components/ContextualGuide'
import DirectoryFilterSheet from '@/components/places/DirectoryFilterSheet'
import HaiLoader from '@/components/HaiLoader'
import {
  type DirectoryFilters,
  type DirectorySort,
  hasActiveFilters,
  serializeDirectoryFilters,
} from '@/lib/places/directoryFilters'

const DEFAULT_FILTERS: DirectoryFilters = {
  minRating: null,
  openNow: false,
  verifiedOnly: false,
  hasPhotos: false,
  sort: 'newest',
}

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
  /** Filters parsed by SSR from URL params so first-paint matches
   *  the URL state (e.g. /directory?minRating=4.5&sort=top). */
  initialFilters?: DirectoryFilters
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
  initialFilters,
}: Props) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  const searchParams = useSearchParams()
  // Two surfaces under one "دليل الحي": map-based places vs lightweight
  // service contacts/numbers. The add-service flow routes back with
  // ?tab=services so the user lands on the right tab.
  const [tab, setTab] = useState<'places' | 'services'>(
    searchParams?.get('tab') === 'services' ? 'services' : 'places',
  )

  const [q, setQ] = useState('')
  const [category, setCategory] = useState<PlaceCategory | null>(null)
  const [filters, setFilters] = useState<DirectoryFilters>(
    initialFilters ?? DEFAULT_FILTERS,
  )
  const [filterOpen, setFilterOpen] = useState(false)
  const [places, setPlaces] = useState<PublicPlace[]>(initialPlaces)
  const [loading, setLoading] = useState(false)

  const filtersActive = hasActiveFilters(filters)

  // Refetch when ANY filter / query / category changes. The SSR
  // slice already reflects initialFilters, so we only short-circuit
  // when there's nothing additional layered on top of it.
  useEffect(() => {
    const noFilterLayer =
      !q &&
      !category &&
      !filtersActive &&
      // initialFilters provided (or DEFAULT_FILTERS) — if filters
      // currently equal what SSR was rendered with we can reuse
      // initialPlaces. With filtersActive=false this is the
      // default-no-filter state, so always safe.
      true
    if (noFilterLayer) {
      // Cleared the search / dropped every filter: snap back to the
      // SSR slice and force-clear the loading flag in case a prior
      // fetch left it stuck on `true` (this branch returns without
      // a finally, so the spinner would otherwise linger forever).
      setPlaces(initialPlaces)
      setLoading(false)
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
    // Pro filters
    const filterParams = serializeDirectoryFilters(filters)
    for (const [k, v] of Object.entries(filterParams)) params.set(k, v)
    fetch(`/api/directory?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (aborted) return
        setPlaces(Array.isArray(d.places) ? d.places : [])
      })
      .catch(() => {})
      .finally(() => { if (!aborted) setLoading(false) })
    return () => { aborted = true }
  }, [q, category, filters, filtersActive, initialPlaces, isReadOnly, browseNeighborhood?.id])

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

        {/* Places vs Service contacts — two surfaces under دليل الحي. */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => setTab('places')}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'places' ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
          >
            🏘️ {tr('Places', 'أماكن', 'جگہیں')}
          </button>
          <button
            type="button"
            onClick={() => setTab('services')}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${tab === 'services' ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
          >
            📇 {tr('Services & numbers', 'خدمات وأرقام', 'خدمات و نمبر')}
          </button>
        </div>

        {/* My directory contributions (reputation history). Own-nbhd only. */}
        {!isReadOnly && (
          <Link href="/directory/contributions" className="flex items-center justify-between rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3.5 py-2.5 active:scale-[0.99] transition-transform">
            <span className="text-[13px] font-medium text-gray-700 dark:text-gray-200">⭐ {tr('My contributions', 'مساهماتي ونقاطي', 'میری شراکتیں')}</span>
            <span className="text-gray-400 text-lg leading-none">{lang === 'en' ? '›' : '‹'}</span>
          </Link>
        )}

        {tab === 'services' ? (
          <ServiceContactsPanel
            isReadOnly={isReadOnly}
            browseNeighborhoodId={isReadOnly ? (browseNeighborhood?.id ?? null) : null}
          />
        ) : (
        <>
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

        {/* Filter pill lives at the start of the category-chips
            scroll row so it stays visually grouped with the rest
            of the filter affordances. A subtle vertical divider
            separates the modal-filter pill from the inline
            category chips. */}
        <div className="flex items-center gap-2" data-guide="dir-search">
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filtersActive
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
          >
            <FiSliders className="w-3.5 h-3.5" />
            {tr('Filter', 'تصفية', 'فلٹر')}
          </button>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <CategoryChips selected={category} onSelect={setCategory} />
          </div>
        </div>

        {/* Active-filter chips — only rendered when at least one
            filter is on. No empty row when filtersActive is false. */}
        {filtersActive && (
          <div className="flex items-center gap-2 flex-wrap">
            {filters.minRating !== null && (
              <ActiveChip
                label={`★${filters.minRating}+`}
                onClear={() => setFilters((f) => ({ ...f, minRating: null }))}
              />
            )}
            {filters.openNow && (
              <ActiveChip
                label={tr('Open now', 'مفتوح الآن', 'ابھی کھلا')}
                onClear={() => setFilters((f) => ({ ...f, openNow: false }))}
              />
            )}
            {filters.verifiedOnly && (
              <ActiveChip
                label={tr('Verified', 'موثّق', 'تصدیق شدہ')}
                onClear={() => setFilters((f) => ({ ...f, verifiedOnly: false }))}
              />
            )}
            {filters.hasPhotos && (
              <ActiveChip
                label={tr('Photos', 'صور', 'تصاویر')}
                onClear={() => setFilters((f) => ({ ...f, hasPhotos: false }))}
              />
            )}
            {filters.sort !== 'newest' && (
              <ActiveChip
                label={sortLabel(filters.sort, lang)}
                onClear={() => setFilters((f) => ({ ...f, sort: 'newest' }))}
              />
            )}
          </div>
        )}

        {loading && (
          <div className="py-2">
            <HaiLoader size="md" />
          </div>
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
          <div className="space-y-2.5" style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 2rem)' }}>
            {places.map((p) => <PlaceCard key={p.id} place={p} />)}
          </div>
        )}
        </>
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
      <DirectoryFilterSheet
        open={filterOpen}
        initial={filters}
        onClose={() => setFilterOpen(false)}
        onApply={(next) => setFilters(next)}
      />
    </main>
  )
}

function ActiveChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-[11px] font-semibold border border-primary-200 dark:border-primary-800">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label="إزالة"
        className="-me-1 w-4 h-4 rounded-full flex items-center justify-center active:bg-primary-100 dark:active:bg-primary-900/50"
      >
        <FiX className="w-3 h-3" />
      </button>
    </span>
  )
}

function sortLabel(s: DirectorySort, lang: string): string {
  const map: Record<DirectorySort, [en: string, ar: string, ur: string]> = {
    top:      ['Top rated',     'الأعلى تقييماً', 'سب سے اعلیٰ'],
    reviewed: ['Most reviewed', 'الأكثر مراجعات', 'سب سے زیادہ جائزے'],
    newest:   ['Newest',        'الأحدث',         'تازہ ترین'],
    alpha:    ['A→Z',           'أبجدي',          'حروف تہجی'],
  }
  const [en, ar, ur] = map[s]
  return lang === 'en' ? en : lang === 'ur' ? ur : ar
}

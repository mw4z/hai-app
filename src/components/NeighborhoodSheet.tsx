'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FiMapPin, FiSearch, FiX, FiNavigation, FiCornerUpLeft } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { hapticLight } from '@/lib/haptic'
import { useDragToDismiss } from '@/hooks/useDragToDismiss'

type NeighborhoodItem = {
  id: string
  name: string
  nameEn: string
  lat?: number | null
  lng?: number | null
  cityName: string
  cityNameEn: string
}

type Props = {
  open: boolean
  onClose: () => void
  onSelect: (n: { id: string; displayName: string; isHome: boolean }) => void
  user: {
    neighborhoodId: string
    neighborhood: string
    neighborhoodEn: string
    city: string
    cityEn: string
  }
  browseNeighborhoodId: string | null
  allNeighborhoods: NeighborhoodItem[]
  loading: boolean
  isReadOnly: boolean
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export default function NeighborhoodSheet({
  open,
  onClose,
  onSelect,
  user,
  browseNeighborhoodId,
  allNeighborhoods,
  loading,
  isReadOnly,
}: Props) {
  const { t, lang } = useLanguage()
  const dn = (ar: string, en: string) => (lang === 'en' && en ? en : ar)
  const [query, setQuery] = useState('')
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (!open) {
      setEntered(false)
      setQuery('')
      return
    }
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Derive user's lat/lng from the neighborhoods array
  const mine = useMemo(
    () => allNeighborhoods.find((n) => n.id === user.neighborhoodId),
    [allNeighborhoods, user.neighborhoodId],
  )
  const myLat = mine?.lat ?? null
  const myLng = mine?.lng ?? null

  const withDistance = useMemo(() => {
    return allNeighborhoods
      .filter((n) => n.id !== user.neighborhoodId)
      .map((n) => {
        let km: number | null = null
        if (myLat != null && myLng != null && n.lat != null && n.lng != null) {
          km = haversineKm(myLat, myLng, n.lat, n.lng)
        }
        return { ...n, km }
      })
      .sort((a, b) => {
        if (a.km != null && b.km != null) return a.km - b.km
        if (a.km != null) return -1
        if (b.km != null) return 1
        return 0
      })
  }, [allNeighborhoods, user.neighborhoodId, myLat, myLng])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return withDistance
    return withDistance.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.nameEn.toLowerCase().includes(q) ||
        n.cityName.toLowerCase().includes(q) ||
        n.cityNameEn.toLowerCase().includes(q),
    )
  }, [withDistance, query])

  // Incremental rendering. Rendering ~1k buttons synchronously when
  // the sheet opens is what was making the tap feel sluggish. Show
  // the first PAGE nearest (already sorted by distance) and reveal
  // more as the user scrolls toward the bottom.
  const PAGE = 40
  const [visibleCount, setVisibleCount] = useState(PAGE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => { setVisibleCount(PAGE) }, [query, open])
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisibleCount((c) => Math.min(c + PAGE, filtered.length))
      }
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [filtered.length])
  const visibleItems = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])

  const { sheetRef, handleRef } = useDragToDismiss<HTMLDivElement, HTMLDivElement>({ open, onDismiss: onClose })

  if (!open) return null

  return (
    <>
      <div
        data-overlay="true"
        onClick={onClose}
        className={`fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          entered ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        ref={sheetRef}
        data-overlay="true"
        className={`fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto z-[61] bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          entered ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{
          height: '82vh',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-5 pt-3 pb-4 border-b border-gray-100 dark:border-gray-800">
          {/* Grab handle + title row — this area triggers drag-to-dismiss.
              Search input below is excluded so typing still works. */}
          <div ref={handleRef} className="touch-none">
            <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-md shadow-primary-500/30">
                <FiNavigation className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="font-black text-gray-900 dark:text-white text-base leading-tight">
                  {t('feed_browse_title')}
                </h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">
                  {t('feed_browse_subtitle')}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center active:scale-90 transition-transform"
              aria-label="Close"
            >
              <FiX className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-2xl px-4 py-3.5 border border-gray-200 dark:border-gray-700 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200 dark:focus-within:ring-primary-900/40 transition-all">
            <FiSearch className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              placeholder={t('feed_search_area')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-base focus:outline-none text-gray-800 dark:text-gray-100 placeholder:text-gray-400"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="text-gray-400 active:scale-90 p-0.5"
                aria-label="Clear"
              >
                <FiX className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-6">
          {/* Your neighborhood hero */}
          <section className="mb-5">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2 font-bold">
              {t('feed_your_nbhd')}
            </p>
            <button
              onClick={() => {
                hapticLight()
                onSelect({
                  id: user.neighborhoodId,
                  displayName: dn(user.neighborhood, user.neighborhoodEn),
                  isHome: true,
                })
              }}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-start transition-all active:scale-[0.98] ${
                !isReadOnly
                  ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30'
                  : 'bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700'
              }`}
            >
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  !isReadOnly
                    ? 'bg-white/20'
                    : 'bg-primary-100 dark:bg-primary-800/60'
                }`}
              >
                <FiMapPin
                  className={`w-5 h-5 ${
                    !isReadOnly
                      ? 'text-white'
                      : 'text-primary-600 dark:text-primary-300'
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={`text-base font-bold truncate ${
                    !isReadOnly ? 'text-white' : 'text-gray-900 dark:text-white'
                  }`}
                >
                  {dn(user.neighborhood, user.neighborhoodEn)}
                </div>
                <div
                  className={`text-[11px] truncate ${
                    !isReadOnly
                      ? 'text-white/80'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {dn(user.city, user.cityEn)}
                </div>
              </div>
              {!isReadOnly ? (
                <span className="text-[10px] bg-white/25 text-white px-2 py-0.5 rounded-full font-black tracking-wider">
                  {t('feed_browse_here')}
                </span>
              ) : (
                <div className="flex items-center gap-1 text-[11px] text-primary-600 dark:text-primary-400 font-bold">
                  <FiCornerUpLeft className="w-3.5 h-3.5" />
                  {t('feed_return_nbhd')}
                </div>
              )}
            </button>
          </section>

          {/* Other neighborhoods */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold">
                {t('feed_other_nbhds')}
              </p>
              {!loading && filtered.length > 0 && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold tabular-nums">
                  {filtered.length}
                </p>
              )}
            </div>

            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800/40"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="w-10 h-10 rounded-lg hai-shimmer" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-32 rounded hai-shimmer" />
                      <div className="h-2 w-20 rounded hai-shimmer" />
                    </div>
                    <div className="w-12 h-5 rounded-full hai-shimmer" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                  <FiSearch className="w-6 h-6 text-gray-400" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  {query ? t('feed_browse_no_match') : t('feed_browse_no_other')}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {visibleItems.map((n) => {
                  const isBrowsing = browseNeighborhoodId === n.id
                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        hapticLight()
                        onSelect({
                          id: n.id,
                          displayName: dn(n.name, n.nameEn),
                          isHome: false,
                        })
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-start active:scale-[0.98] transition-transform ${
                        isBrowsing
                          ? 'bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800'
                          : 'bg-gray-50 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isBrowsing
                            ? 'bg-amber-100 dark:bg-amber-800/50'
                            : 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700'
                        }`}
                      >
                        <FiMapPin
                          className={`w-4 h-4 ${
                            isBrowsing
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                          {dn(n.name, n.nameEn)}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                          {dn(n.cityName, n.cityNameEn)}
                        </div>
                      </div>
                      {n.km != null && (
                        <span
                          className={`text-[10px] font-black px-2 py-1 rounded-full flex-shrink-0 tabular-nums ${
                            isBrowsing
                              ? 'bg-amber-200 dark:bg-amber-700/60 text-amber-800 dark:text-amber-100'
                              : 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {n.km < 1 ? `<1 ${t('common_km')}` : `${Math.round(n.km)} ${t('common_km')}`}
                        </span>
                      )}
                    </button>
                  )
                })}
                {visibleCount < filtered.length && (
                  <div ref={sentinelRef} className="py-3 text-center text-[11px] text-gray-400">
                    …
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  )
}

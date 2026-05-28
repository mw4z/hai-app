'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { FiChevronDown } from 'react-icons/fi'
import type { ServiceCategory } from '@prisma/client'
import { useLanguage } from '@/hooks/useLanguage'
import { hapticLight } from '@/lib/haptic'
import HaiLoader from '@/components/HaiLoader'
import ServiceContactCard from '@/components/places/ServiceContactCard'
import { SERVICE_CATEGORIES } from '@/lib/services/serviceCategories'
import type { PublicServiceContact } from '@/lib/services/serializeServiceContact'
import CategoryPickerSheet, { type CategoryOption } from '@/components/CategoryPickerSheet'

/** "خدمات وأرقام" tab of the directory — community service contacts.
 *  Self-contained: own search + category filter + fetch. The "add"
 *  affordance is hidden when browsing another neighborhood (writes are
 *  locked to your own; server enforces it too). */
export default function ServiceContactsPanel({
  isReadOnly = false,
  browseNeighborhoodId = null,
}: {
  isReadOnly?: boolean
  browseNeighborhoodId?: string | null
}) {
  const { lang, t } = useLanguage()
  const tr = (en: string, ar: string, ur: string) => (lang === 'en' ? en : lang === 'ur' ? ur : ar)

  const [q, setQ] = useState('')
  const [category, setCategory] = useState<ServiceCategory | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const allLabel = t('categories_browse_all')
  const currentCat = useMemo(
    () => (category ? SERVICE_CATEGORIES.find((c) => c.key === category) ?? null : null),
    [category],
  )
  const currentEmoji = currentCat?.emoji ?? '📇'
  const currentLabel = currentCat
    ? lang === 'en' ? currentCat.labelEn : lang === 'ur' ? currentCat.labelUr : currentCat.labelAr
    : allLabel
  const isFiltered = category !== null

  const pickerOptions = useMemo<CategoryOption[]>(
    () => [
      { value: null, emoji: '📇', label: allLabel },
      ...SERVICE_CATEGORIES.map<CategoryOption>((c) => ({
        value: c.key,
        emoji: c.emoji,
        label: lang === 'en' ? c.labelEn : lang === 'ur' ? c.labelUr : c.labelAr,
      })),
    ],
    [lang, allLabel],
  )
  const [contacts, setContacts] = useState<PublicServiceContact[]>([])
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [canModerate, setCanModerate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // Shared query string for the current filter (offset added per call).
  const buildParams = (offset: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (category) params.set('category', category)
    if (isReadOnly && browseNeighborhoodId) params.set('neighborhood', browseNeighborhoodId)
    if (offset > 0) params.set('offset', String(offset))
    return params
  }

  // First page — re-runs whenever the filter changes (replaces the list).
  useEffect(() => {
    let aborted = false
    setLoading(true)
    fetch(`/api/directory/service-contacts?${buildParams(0).toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (aborted) return
        setContacts(Array.isArray(d.contacts) ? d.contacts : [])
        setHasMore(!!d.hasMore)
        setViewerId(d.viewerId ?? null)
        setCanModerate(!!d.canModerate)
      })
      .catch(() => {})
      .finally(() => { if (!aborted) setLoading(false) })
    return () => { aborted = true }
  }, [q, category, isReadOnly, browseNeighborhoodId])

  // "Show more" — append the next page (browse only; search is single-page).
  const loadMore = () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    fetch(`/api/directory/service-contacts?${buildParams(contacts.length).toString()}`)
      .then((r) => r.json())
      .then((d) => {
        const more: PublicServiceContact[] = Array.isArray(d.contacts) ? d.contacts : []
        // Guard against duplicates if rows shifted between pages.
        setContacts((prev) => {
          const seen = new Set(prev.map((x) => x.id))
          return [...prev, ...more.filter((x) => !seen.has(x.id))]
        })
        setHasMore(!!d.hasMore)
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr('Search services & numbers', 'ابحث عن خدمة أو رقم', 'خدمات تلاش کریں')}
          className="flex-1 px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {!isReadOnly && (
          <Link
            href="/directory/services/new"
            className="flex-shrink-0 px-4 py-3 rounded-2xl bg-primary-600 text-white text-sm font-semibold active:scale-95 transition-transform"
          >
            +
          </Link>
        )}
      </div>

      {/* Service-category picker — one dropdown trigger that opens
          the bottom-sheet vertical list. Same affordance as the Places
          tab + the Feed so the elderly / low-tech audience never has
          to swipe a hidden chip row to find a category. */}
      <button
        type="button"
        onClick={() => { hapticLight(); setPickerOpen(true) }}
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        className={`w-full inline-flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-[15px] font-bold transition-colors active:scale-[0.98] shadow-[0_2px_10px_rgba(14,165,233,0.12)] ${
          isFiltered
            ? 'bg-primary-100 dark:bg-primary-900/35 border-2 border-primary-500 dark:border-primary-500 text-primary-900 dark:text-primary-100'
            : 'bg-primary-50 dark:bg-primary-900/20 border-2 border-primary-300 dark:border-primary-700/60 text-gray-900 dark:text-white'
        }`}
      >
        <span className="inline-flex items-center gap-2.5 min-w-0">
          <span className="text-lg flex-shrink-0" aria-hidden>{currentEmoji}</span>
          <span className="truncate">{currentLabel}</span>
        </span>
        <FiChevronDown
          className={`w-5 h-5 flex-shrink-0 text-primary-600 dark:text-primary-300 transition-transform ${
            pickerOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      <CategoryPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selected={category}
        onSelect={(v) => setCategory(v as ServiceCategory | null)}
        title={t('categories_pick_dir')}
        options={pickerOptions}
      />

      {loading ? (
        <div className="py-2"><HaiLoader size="md" /></div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-5xl mb-3">📇</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {tr('No service contacts yet.', 'لا توجد خدمات أو أرقام بعد.', 'ابھی کوئی خدمت نہیں۔')}
          </p>
          {!isReadOnly && (
            <Link href="/directory/services/new" className="inline-block mt-4 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold active:scale-95">
              {tr('Add a service / number', 'إضافة خدمة / رقم', 'خدمت شامل کریں')}
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2.5" style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 2rem)' }}>
          {contacts.map((c) => (
            <ServiceContactCard
              key={c.id}
              contact={c}
              currentUserId={viewerId}
              canModerate={canModerate}
              onRemoved={(id) => setContacts((prev) => prev.filter((x) => x.id !== id))}
              onUpdated={(u) => setContacts((prev) => prev.map((x) => (x.id === u.id ? u : x)))}
            />
          ))}

          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              {loadingMore ? tr('Loading…', 'جاري التحميل…', 'لوڈ ہو رہا ہے…') : tr('Show more', 'عرض المزيد', 'مزید دکھائیں')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

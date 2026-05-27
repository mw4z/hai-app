'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ServiceCategory } from '@prisma/client'
import { useLanguage } from '@/hooks/useLanguage'
import HaiLoader from '@/components/HaiLoader'
import ServiceContactCard from '@/components/places/ServiceContactCard'
import { SERVICE_CATEGORIES } from '@/lib/services/serviceCategories'
import type { PublicServiceContact } from '@/lib/services/serializeServiceContact'

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
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) => (lang === 'en' ? en : lang === 'ur' ? ur : ar)

  const [q, setQ] = useState('')
  const [category, setCategory] = useState<ServiceCategory | null>(null)
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

      {/* Service-category chips */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
        <button
          type="button"
          onClick={() => setCategory(null)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${category === null ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
        >
          {tr('All', 'الكل', 'سب')}
        </button>
        {SERVICE_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory((cur) => (cur === c.key ? null : c.key))}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${category === c.key ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
          >
            {c.emoji} {lang === 'en' ? c.labelEn : lang === 'ur' ? c.labelUr : c.labelAr}
          </button>
        ))}
      </div>

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

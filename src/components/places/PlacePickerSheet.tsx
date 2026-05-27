'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiX, FiSearch, FiPhone } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useDragToDismiss } from '@/hooks/useDragToDismiss'
import { getCategoryMeta, PLACE_CATEGORIES } from '@/lib/places/categories'
import { getServiceCategoryMeta, SERVICE_CATEGORIES } from '@/lib/services/serviceCategories'
import PlaceStatusBadge from '@/components/places/PlaceStatusBadge'
import HaiLoader from '@/components/HaiLoader'

/**
 * Bottom sheet for attaching something from دليل الحي to a post, comment,
 * or chat message. Two tabs:
 *   - Places   → /api/directory          → inserts a /directory/<id> link
 *                (rendered as a place preview card)
 *   - Services → /api/directory/service-contacts → inserts a callable
 *                "📱 name — phone" snippet (rendered with call/WhatsApp)
 *
 * On select, fires onSelect with a discriminated item so the composer
 * knows which kind of text to insert. No creation from this sheet.
 */

interface PickerPlace {
  id: string
  name: string
  category: string
  status: string
  addressText: string | null
}

interface PickerService {
  id: string
  displayName: string
  category: string
  serviceArea: string | null
  phone: string
  whatsapp: boolean
}

export type PickedDirectoryItem =
  | { kind: 'place'; id: string; name: string }
  | { kind: 'service'; id: string; name: string; phone: string; whatsapp: boolean }

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (item: PickedDirectoryItem) => void
}

type Tab = 'places' | 'services'

const SEARCH_DEBOUNCE_MS = 300

export default function PlacePickerSheet({ open, onClose, onSelect }: Props) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  const [tab, setTab] = useState<Tab>('places')
  const [q, setQ] = useState('')
  const [places, setPlaces] = useState<PickerPlace[] | null>(null)
  const [services, setServices] = useState<PickerService[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useBodyScrollLock(open)
  const { sheetRef, handleRef, bodyRef } = useDragToDismiss<HTMLDivElement, HTMLDivElement, HTMLDivElement>({ open, onDismiss: onClose })

  const mapServices = (data: any): PickerService[] =>
    (Array.isArray(data?.contacts) ? data.contacts : []).map((c: any) => ({
      id: c.id, displayName: c.displayName, category: c.category,
      serviceArea: c.serviceArea ?? null, phone: c.phone, whatsapp: !!c.whatsapp,
    }))
  const mapPlaces = (data: any): PickerPlace[] =>
    (Array.isArray(data?.places) ? data.places : []).map((p: any) => ({
      id: p.id, name: p.name, category: p.category,
      status: p.status, addressText: p.addressText ?? null,
    }))
  const buildUrl = (offset: number) => {
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (category) params.set('category', category)
    if (offset > 0) params.set('offset', String(offset))
    const base = tab === 'services' ? '/api/directory/service-contacts' : '/api/directory'
    return `${base}?${params.toString()}`
  }

  // Debounced first-page fetch for the active tab + category. Empty query
  // loads the neighborhood's most recent entries.
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(buildUrl(0), { credentials: 'include', cache: 'no-store' })
        if (!res.ok) { if (tab === 'services') setServices([]); else setPlaces([]); setHasMore(false); return }
        const data = await res.json()
        setHasMore(!!data.hasMore)
        if (tab === 'services') setServices(mapServices(data)); else setPlaces(mapPlaces(data))
      } catch {
        if (tab === 'services') setServices([]); else setPlaces([]); setHasMore(false)
      } finally {
        setLoading(false)
      }
    }, q ? SEARCH_DEBOUNCE_MS : 0)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [open, q, tab, category])

  // Append the next page (offset = current count). De-dupes by id.
  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const offset = (tab === 'services' ? services?.length : places?.length) || 0
      const res = await fetch(buildUrl(offset), { credentials: 'include', cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setHasMore(!!data.hasMore)
      if (tab === 'services') {
        const more = mapServices(data)
        setServices((prev) => { const seen = new Set((prev ?? []).map((x) => x.id)); return [...(prev ?? []), ...more.filter((x) => !seen.has(x.id))] })
      } else {
        const more = mapPlaces(data)
        setPlaces((prev) => { const seen = new Set((prev ?? []).map((x) => x.id)); return [...(prev ?? []), ...more.filter((x) => !seen.has(x.id))] })
      }
    } catch { /* keep what we have */ } finally {
      setLoadingMore(false)
    }
  }

  // Reset on open.
  useEffect(() => {
    if (open) {
      setTab('places')
      setQ('')
      setCategory(null)
      setHasMore(false)
      setPlaces(null)
      setServices(null)
    }
  }, [open])

  // ESC closes.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  if (typeof document === 'undefined' || !document.body) return null

  function pickPlace(p: PickerPlace) {
    onSelect({ kind: 'place', id: p.id, name: p.name })
    onClose()
  }
  function pickService(s: PickerService) {
    onSelect({ kind: 'service', id: s.id, name: s.displayName, phone: s.phone, whatsapp: s.whatsapp })
    onClose()
  }

  const results = tab === 'services' ? services : places
  const chipCls = (active: boolean) =>
    `flex-shrink-0 px-3 py-1.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap ${active ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`
  const tabBtn = (t: Tab, label: string) => (
    <button
      type="button"
      onClick={() => { setTab(t); setQ(''); setCategory(null); setHasMore(false) }}
      className={`flex-1 py-2 rounded-xl text-[13px] font-bold transition-colors ${tab === t ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
    >
      {label}
    </button>
  )

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] bg-black/50 flex items-end justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hai-place-picker-title"
    >
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] max-h-[80vh] flex flex-col bg-white dark:bg-gray-900 rounded-t-3xl"
        style={{ paddingBottom: 'var(--hai-safe-bottom, 0px)' }}
      >
        <div ref={handleRef} className="px-4 pt-3 pb-2 flex-shrink-0 border-b border-gray-100 dark:border-gray-800">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-2" />
          <div className="flex items-center justify-between mb-2">
            <h2 id="hai-place-picker-title" className="text-sm font-bold text-gray-900 dark:text-white">
              {tr('Attach from directory', 'إرفاق من دليل الحي', 'ڈائریکٹری سے منسلک کریں')}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={tr('Close', 'إغلاق', 'بند کریں')}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:bg-gray-100 dark:active:bg-gray-800"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-2 mb-2">
            {tabBtn('places', `🏘️ ${tr('Places', 'أماكن', 'جگہیں')}`)}
            {tabBtn('services', `📇 ${tr('Services & numbers', 'خدمات وأرقام', 'خدمات و نمبر')}`)}
          </div>

          <div className="relative">
            <FiSearch className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tab === 'services'
                ? tr('Search services & numbers', 'ابحث عن خدمة أو رقم', 'خدمات تلاش کریں')
                : tr('Search the neighborhood directory', 'ابحث عن مكان في دليل الحي', 'محلے کی ڈائرکٹری تلاش کریں')}
              className="w-full ps-9 pe-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
          </div>

          {/* Category filter — PlaceCategory on the Places tab,
              ServiceCategory on the Services tab. */}
          <div className="flex gap-1.5 mt-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
            <button type="button" onClick={() => setCategory(null)} className={chipCls(category === null)}>
              {tr('All', 'الكل', 'سب')}
            </button>
            {(tab === 'services' ? SERVICE_CATEGORIES : PLACE_CATEGORIES).map((c) => (
              <button key={c.key} type="button" onClick={() => setCategory((cur) => (cur === c.key ? null : c.key))} className={chipCls(category === c.key)}>
                {c.emoji} {lang === 'en' ? c.labelEn : lang === 'ur' ? c.labelUr : c.labelAr}
              </button>
            ))}
          </div>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-3">
          {loading && results === null && (
            <div className="py-8"><HaiLoader size="md" /></div>
          )}
          {results !== null && results.length === 0 && !loading && (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-10">
              {tab === 'services'
                ? tr('No service contacts yet.', 'لا توجد خدمات أو أرقام بعد.', 'ابھی کوئی خدمت نہیں۔')
                : (q ? 'ما لقينا مكان بهذا الاسم' : tr('No places in this neighborhood yet.', 'لا توجد أماكن في هذا الحي بعد.', 'اس محلے میں ابھی کوئی جگہ نہیں۔'))}
            </p>
          )}

          {tab === 'places' ? (
            <ul className="space-y-2">
              {(places ?? []).map((p) => {
                const cat = getCategoryMeta(p.category as any)
                const categoryLabel = lang === 'en' ? cat.labelEn : lang === 'ur' ? cat.labelUr : cat.labelAr
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => pickPlace(p)}
                      className="w-full flex items-start gap-3 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-start active:scale-[0.99] transition-transform"
                    >
                      <span className="text-2xl leading-none flex-shrink-0" aria-hidden>{cat.emoji}</span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-start gap-2">
                          <span className="text-[14px] font-bold text-gray-900 dark:text-white flex-1 truncate">{p.name}</span>
                          <PlaceStatusBadge status={p.status as any} source={(p as any).source} />
                        </span>
                        <span className="block text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {categoryLabel}{p.addressText ? ` · ${p.addressText}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <ul className="space-y-2">
              {(services ?? []).map((s) => {
                const cat = getServiceCategoryMeta(s.category as any)
                const categoryLabel = lang === 'en' ? cat.labelEn : lang === 'ur' ? cat.labelUr : cat.labelAr
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => pickService(s)}
                      className="w-full flex items-start gap-3 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-start active:scale-[0.99] transition-transform"
                    >
                      <span className="text-2xl leading-none flex-shrink-0" aria-hidden>{cat.emoji}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-bold text-gray-900 dark:text-white truncate">{s.displayName}</span>
                        <span className="block text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {categoryLabel}{s.serviceArea ? ` · ${s.serviceArea}` : ''}
                        </span>
                        <span className="flex items-center gap-1 text-[11.5px] text-primary-600 dark:text-primary-400 mt-0.5" dir="ltr">
                          <FiPhone className="w-3 h-3" /> {s.phone}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full mt-2 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[13px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              {loadingMore ? tr('Loading…', 'جاري التحميل…', 'لوڈ ہو رہا ہے…') : tr('Show more', 'عرض المزيد', 'مزید دکھائیں')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

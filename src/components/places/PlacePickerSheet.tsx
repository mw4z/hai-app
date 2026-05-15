'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiX, FiSearch } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { getCategoryMeta } from '@/lib/places/categories'
import PlaceStatusBadge from '@/components/places/PlaceStatusBadge'

/**
 * Bottom sheet for picking a directory place to attach to a post,
 * comment, or chat message. Calls the existing `/api/directory?q=…`
 * endpoint which is gated server-side by directoryServerMode(); a
 * resident on an admin-only build sees an empty list.
 *
 * On select, fires onSelect(place) with the minimal { id, name }
 * payload the composer needs to insert the directory link into
 * the message text. No place creation from this sheet (defer to
 * the directory's own /directory/new).
 */

interface PickerPlace {
  id: string
  name: string
  category: string
  status: string
  addressText: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (place: PickerPlace) => void
}

const SEARCH_DEBOUNCE_MS = 300

export default function PlacePickerSheet({ open, onClose, onSelect }: Props) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  const [q, setQ] = useState('')
  const [results, setResults] = useState<PickerPlace[] | null>(null)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useBodyScrollLock(open)

  // Debounced fetch. Empty query loads the user's neighborhood's
  // top 30 by recency (same as the directory list page).
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (q.trim()) params.set('q', q.trim())
        const res = await fetch(`/api/directory?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        if (!res.ok) {
          setResults([])
          return
        }
        const data = await res.json()
        const places = Array.isArray(data?.places) ? data.places : []
        setResults(
          places.map((p: any) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            status: p.status,
            addressText: p.addressText ?? null,
          })),
        )
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, q ? SEARCH_DEBOUNCE_MS : 0)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [open, q])

  // Reset query each time the sheet opens so a previous search
  // doesn't auto-populate.
  useEffect(() => {
    if (open) {
      setQ('')
      setResults(null)
    }
  }, [open])

  // ESC closes.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  if (typeof document === 'undefined' || !document.body) return null

  function handleSelect(p: PickerPlace) {
    onSelect(p)
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] bg-black/50 flex items-end justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hai-place-picker-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] max-h-[80vh] flex flex-col bg-white dark:bg-gray-900 rounded-t-3xl"
      >
        {/* Header — drag handle + title + close */}
        <div className="px-4 pt-3 pb-2 flex-shrink-0 border-b border-gray-100 dark:border-gray-800">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-2" />
          <div className="flex items-center justify-between mb-2">
            <h2
              id="hai-place-picker-title"
              className="text-sm font-bold text-gray-900 dark:text-white"
            >
              {tr('Attach a place', 'إرفاق مكان', 'جگہ منسلک کریں')}
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
          <div className="relative">
            <FiSearch
              className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-gray-400 pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr(
                'Search the neighborhood directory',
                'ابحث عن مكان في دليل الحي',
                'محلے کی ڈائرکٹری تلاش کریں',
              )}
              className="w-full ps-9 pe-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
          </div>
        </div>

        {/* Result list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && results === null && (
            <p className="text-center text-xs text-gray-400 py-8">
              {tr('Loading…', 'جاري التحميل…', 'لوڈ ہو رہا ہے…')}
            </p>
          )}
          {results !== null && results.length === 0 && !loading && (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-10">
              {q
                ? 'ما لقينا مكان بهذا الاسم'
                : tr(
                    'No places in this neighborhood yet.',
                    'لا توجد أماكن في هذا الحي بعد.',
                    'اس محلے میں ابھی کوئی جگہ نہیں۔',
                  )}
            </p>
          )}
          <ul className="space-y-2">
            {(results ?? []).map((p) => {
              const cat = getCategoryMeta(p.category as any)
              const categoryLabel =
                lang === 'en' ? cat.labelEn : lang === 'ur' ? cat.labelUr : cat.labelAr
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(p)}
                    className="w-full flex items-start gap-3 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 text-start active:scale-[0.99] transition-transform"
                  >
                    <span className="text-2xl leading-none flex-shrink-0" aria-hidden>
                      {cat.emoji}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-start gap-2">
                        <span className="text-[14px] font-bold text-gray-900 dark:text-white flex-1 truncate">
                          {p.name}
                        </span>
                        <PlaceStatusBadge status={p.status as any} />
                      </span>
                      <span className="block text-[11.5px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        {categoryLabel}
                        {p.addressText ? ` · ${p.addressText}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FiSend } from 'react-icons/fi'
import ImageLightbox from './ImageLightbox'

/**
 * A provider's service catalog (grid of items) shown inside the user profile
 * sheet. Fetches /api/service-items?userId=… and renders nothing if empty.
 * Extracted from PostCard so the profile sheet can be shared by the feed and
 * the admin dashboard.
 */
export default function ServiceCatalog({ userId, lang }: { userId: string; lang: string }) {
  const router = useRouter()
  const [items, setItems] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [catalogLightbox, setCatalogLightbox] = useState(false)

  useEffect(() => {
    fetch(`/api/service-items?userId=${userId}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setItems(d) })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [userId])

  if (!loaded || items.length === 0) return null

  const shown = expanded ? items : items.slice(0, 4)
  const dn = (ar: string, en: string) => lang === 'en' ? en : ar

  return (
    <div className="mt-4 w-full">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
        {dn('الكتالوج', 'Catalog')} ({items.length})
      </p>

      {/* 2-column grid */}
      <div className="grid grid-cols-2 gap-2">
        {shown.map(item => (
          <button
            key={item.id}
            onClick={() => setSelected(item)}
            className="bg-gray-50 dark:bg-gray-700/50 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-600 text-start active:scale-[0.97] transition-transform"
          >
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" className="w-full h-24 object-cover" />
            ) : (
              <div className="w-full h-16 bg-gray-100 dark:bg-gray-600 flex items-center justify-center text-2xl text-gray-300">📦</div>
            )}
            <div className="p-2">
              <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{item.title}</p>
              <p className="text-[11px] font-bold text-primary-600 dark:text-primary-400 mt-0.5">
                {item.price != null ? `${item.price} ${dn('ريال', 'SAR')}` : dn('تواصل للسعر', 'Contact')}
              </p>
            </div>
          </button>
        ))}
      </div>

      {items.length > 4 && !expanded && (
        <button onClick={() => setExpanded(true)} className="w-full text-center text-xs text-primary-600 font-medium mt-2.5 py-1">
          {dn(`عرض الكل (${items.length})`, `Show all ${items.length} items`)}
        </button>
      )}

      {/* Item Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-[9998] bg-black/60 flex items-end justify-center" onClick={() => setSelected(null)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-t-3xl w-full max-w-md max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
            style={{ paddingBottom: 'var(--hai-safe-bottom, 0px)' }}
          >
            {/* Image */}
            {selected.imageUrl ? (
              <img src={selected.imageUrl} alt="" className="w-full h-48 object-cover cursor-pointer" onClick={() => setCatalogLightbox(true)} />
            ) : (
              <div className="w-full h-32 bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-4xl text-gray-300">📦</div>
            )}

            <div className="p-5">
              {/* Title + Price */}
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{selected.title}</h3>
              <p className="text-base font-bold text-primary-600 dark:text-primary-400 mt-1">
                {selected.price != null ? `${selected.price} ${dn('ريال', 'SAR')}` : dn('السعر عند التواصل', 'Contact for price')}
              </p>

              {/* Description */}
              {selected.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-3 leading-relaxed">{selected.description}</p>
              )}

              {/* CTA */}
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/threads', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId }),
                    })
                    if (res.ok) {
                      const { threadId } = await res.json()
                      router.push(`/threads/${threadId}`)
                    }
                  } catch {}
                }}
                className="w-full mt-5 bg-primary-600 text-white py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <FiSend className="w-4 h-4" />
                {dn('تواصل لطلب الخدمة', 'Request this service')}
              </button>

              <button onClick={() => setSelected(null)} className="w-full text-center text-xs text-gray-400 mt-3 py-2">
                {dn('إغلاق', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Tap the catalog item photo → full-screen lightbox (sits above the
          z-[9998] detail modal via --hai-z-lightbox). */}
      <ImageLightbox
        images={selected?.imageUrl ? [selected.imageUrl] : []}
        initialIndex={0}
        open={catalogLightbox && !!selected?.imageUrl}
        onClose={() => setCatalogLightbox(false)}
      />
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiX, FiSearch } from 'react-icons/fi'
import Sticker from './Sticker'
import { useLanguage } from '@/hooks/useLanguage'
import { hapticLight } from '@/lib/haptic'
import { pushBackHandler } from '@/lib/backHandler'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import {
  STICKER_CATEGORIES,
  stickersByCategory,
  searchStickers,
  type StickerCategory,
} from '@/lib/stickers/catalog'

/**
 * Bottom-sheet sticker picker. Tabs by category + free-text search.
 * Tapping a sticker fires onPick(id) and closes. Portaled to <body> so
 * it floats above the comments sheet / chat composer regardless of any
 * ancestor stacking context.
 */
export default function StickerPicker({
  open,
  onPick,
  onClose,
}: {
  open: boolean
  onPick: (id: string) => void
  onClose: () => void
}) {
  const { lang } = useLanguage()
  const dn = (ar: string, en: string, ur?: string) =>
    lang === 'en' ? en : lang === 'ur' ? (ur ?? ar) : ar

  const [mounted, setMounted] = useState(open)
  const [entered, setEntered] = useState(false)
  const [cat, setCat] = useState<StickerCategory>('blessing')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (open) {
      setMounted(true)
      setQuery('')
      const id1 = requestAnimationFrame(() =>
        requestAnimationFrame(() => setEntered(true)),
      )
      return () => cancelAnimationFrame(id1)
    } else if (mounted) {
      setEntered(false)
      const t = setTimeout(() => setMounted(false), 240)
      return () => clearTimeout(t)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useBodyScrollLock(mounted)
  useEffect(() => {
    if (!mounted) return
    return pushBackHandler(onClose)
  }, [mounted, onClose])

  if (!mounted || typeof document === 'undefined') return null

  const list = query.trim() ? searchStickers(query) : stickersByCategory(cat)

  function handlePick(id: string) {
    hapticLight()
    onPick(id)
    onClose()
  }

  return createPortal(
    <div
      style={{ zIndex: 9999 }}
      className="fixed inset-0 flex items-end justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-200"
        style={{ opacity: entered ? 1 : 0 }}
      />

      {/* Sheet */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl flex flex-col transition-transform duration-200 ease-out"
        style={{
          transform: entered ? 'translateY(0)' : 'translateY(100%)',
          maxHeight: '62vh',
          paddingBottom: 'var(--hai-safe-bottom, 0px)',
        }}
      >
        {/* Grab handle + header */}
        <div className="pt-2.5 px-4 flex-shrink-0">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-700" />
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              {dn('الملصقات', 'Stickers', 'اسٹیکرز')}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label={dn('إغلاق', 'Close')}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:scale-90 transition-transform"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-gray-100 dark:bg-gray-800 px-3 py-1.5">
            <FiSearch className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={dn('ابحث عن ملصق...', 'Search stickers...', 'تلاش کریں...')}
              className="flex-1 bg-transparent text-sm outline-none text-gray-900 dark:text-white placeholder:text-gray-400"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label={dn('مسح', 'Clear')}>
                <FiX className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
        </div>

        {/* Category tabs (hidden while searching) */}
        {!query.trim() && (
          <div className="mt-2 px-3 flex gap-1.5 overflow-x-auto no-scrollbar flex-shrink-0">
            {STICKER_CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCat(c.key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  cat === c.key
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                }`}
              >
                <span className="me-1">{c.emoji}</span>
                {dn(c.ar, c.en, c.ur)}
              </button>
            ))}
          </div>
        )}

        {/* Grid */}
        <div className="mt-2 px-3 pb-3 overflow-y-auto">
          {list.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-10">
              {dn('لا توجد ملصقات', 'No stickers found', 'کوئی اسٹیکر نہیں')}
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2.5">
              {list.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handlePick(s.id)}
                  className="active:scale-90 transition-transform"
                  aria-label={s.lines.join(' ') || s.emoji}
                >
                  <Sticker id={s.id} size={76} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

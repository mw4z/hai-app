'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiCheck, FiX } from 'react-icons/fi'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useLanguage } from '@/hooks/useLanguage'

/** One option in the picker. `value === null` is reserved for the
 *  "All / Clear filter" entry, which appears as the first row. */
export interface CategoryOption {
  value: string | null
  emoji: string
  label: string
  /** Optional secondary line (e.g. "12 posts", "Recently added"). */
  hint?: string
}

interface Props {
  open: boolean
  onClose: () => void
  /** Currently active category — null = the "All" entry. */
  selected: string | null
  onSelect: (value: string | null) => void
  /** Full ordered list of options (caller decides ordering). The
   *  picker does NOT insert an "All" row implicitly — pass it in
   *  as the first option with `value: null` if you want one. */
  options: CategoryOption[]
  /** Sheet title — falls back to "Pick a category" / equivalents. */
  title?: string
}

const SWIPE_CLOSE_THRESHOLD = 100
const SWIPE_MAX_TRAVEL = 360

/**
 * Bottom-sheet category picker. The deliberate replacement for the
 * horizontally-scrolling chip rows on the feed and the directory —
 * less tech-savvy users (this app's elderly target audience) often
 * don't discover that a chip strip continues off-screen, so we give
 * them an explicit, full-height list with one row per category.
 *
 * Implementation notes:
 *  - Portal mount, z-[1100], full-viewport overlay — matches every
 *    other sheet in the app (DirectoryFilterSheet, QuickAskSheet)
 *    so the body scroll lock + iOS WKWebView handling all reuse
 *    the same hardened pattern.
 *  - Drag the header bar downward to dismiss (same gesture as the
 *    other sheets). The list body stays scrollable.
 *  - Tapping a row applies the selection AND closes — one-tap
 *    commit. No "apply" footer; that's friction we don't need for
 *    a simple radio-style picker.
 *  - The active row is filled with the brand colour so it reads as
 *    "you are here" at a glance, even at arm's length.
 */
export default function CategoryPickerSheet({
  open,
  onClose,
  selected,
  onSelect,
  options,
  title,
}: Props) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  const [dragY, setDragY] = useState(0)
  const [animating, setAnimating] = useState(true)
  const dragStartY = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      setDragY(0)
      setAnimating(true)
    }
  }, [open])

  useBodyScrollLock(open)

  if (!open) return null
  if (typeof document === 'undefined' || !document.body) return null

  const heading =
    title ?? tr('Pick a category', 'اختر التصنيف', 'زمرہ منتخب کریں')

  const handlePick = (value: string | null) => {
    onSelect(value)
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[80vh]"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: animating ? 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
        }}
      >
        {/* Drag handle + title. Header is the swipe-to-dismiss surface;
            the list body below stays scrollable on its own. */}
        <div
          className="flex-shrink-0 px-5 pt-3 pb-3 border-b border-gray-100 dark:border-gray-800"
          style={{ touchAction: 'pan-y' }}
          onTouchStart={(e) => {
            dragStartY.current = e.touches[0].clientY
            setAnimating(false)
          }}
          onTouchMove={(e) => {
            if (dragStartY.current === null) return
            const delta = e.touches[0].clientY - dragStartY.current
            if (delta <= 0) {
              setDragY(0)
              return
            }
            setDragY(Math.min(delta, SWIPE_MAX_TRAVEL))
          }}
          onTouchEnd={() => {
            const released = dragY
            dragStartY.current = null
            setAnimating(true)
            if (released >= SWIPE_CLOSE_THRESHOLD) {
              setDragY(window.innerHeight)
              setTimeout(onClose, 200)
            } else {
              setDragY(0)
            }
          }}
        >
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-2.5" />
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              {heading}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={tr('Close', 'إغلاق', 'بند کریں')}
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable list. flex-1 inside a fixed-height flex column so
            iOS WKWebView keeps the touch scroll responsive while the
            body is locked. */}
        <div
          className="flex-1 overflow-y-auto py-2"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {options.map((opt) => {
            const active = (opt.value ?? null) === (selected ?? null)
            return (
              <button
                key={opt.value ?? '__all__'}
                type="button"
                onClick={() => handlePick(opt.value)}
                className={`w-full flex items-center gap-3 px-5 py-3.5 text-start transition-colors ${
                  active
                    ? 'bg-primary-50 dark:bg-primary-900/30'
                    : 'active:bg-gray-50 dark:active:bg-gray-800/60'
                }`}
              >
                <span className="text-2xl flex-shrink-0" aria-hidden>{opt.emoji}</span>
                <span className="flex-1 min-w-0">
                  <span
                    className={`block text-[15px] font-semibold truncate ${
                      active
                        ? 'text-primary-800 dark:text-primary-200'
                        : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    {opt.label}
                  </span>
                  {opt.hint && (
                    <span className="block text-[11.5px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {opt.hint}
                    </span>
                  )}
                </span>
                {active && (
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-600 text-white flex items-center justify-center"
                    aria-hidden
                  >
                    <FiCheck className="w-3.5 h-3.5" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}

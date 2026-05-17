'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiX } from 'react-icons/fi'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useLanguage } from '@/hooks/useLanguage'
import type { DirectoryFilters, DirectorySort } from '@/lib/places/directoryFilters'

/** Drag-to-dismiss threshold (px). Past this, releasing the
 *  finger closes the sheet; below it, the sheet springs back. */
const SWIPE_CLOSE_THRESHOLD = 100
/** Cap how far the sheet can be dragged before release — keeps
 *  the gesture from looking like the user can fling it off the
 *  top of the viewport. */
const SWIPE_MAX_TRAVEL = 360

/**
 * Bottom sheet that edits a DirectoryFilters value. Local
 * staging — changes only fire onApply after the user taps
 * "تطبيق"; the parent caller decides whether to push them
 * to the URL or just to local state. "إعادة تعيين" inside
 * the sheet sets all knobs to the unfiltered defaults
 * without closing it, so the user can tweak and re-apply
 * without two round trips.
 */

interface Props {
  open: boolean
  initial: DirectoryFilters
  onClose: () => void
  onApply: (next: DirectoryFilters) => void
}

const RATING_PRESETS: Array<{ value: number | null; labelAr: string; labelEn: string }> = [
  { value: null, labelAr: 'الكل', labelEn: 'All' },
  { value: 3,   labelAr: '★3+',   labelEn: '★3+' },
  { value: 4,   labelAr: '★4+',   labelEn: '★4+' },
  { value: 4.5, labelAr: '★4.5+', labelEn: '★4.5+' },
]

const SORT_OPTIONS: Array<{ value: DirectorySort; ar: string; en: string; ur: string }> = [
  { value: 'top',      ar: 'الأعلى تقييماً', en: 'Top rated',     ur: 'سب سے اعلیٰ' },
  { value: 'reviewed', ar: 'الأكثر مراجعات', en: 'Most reviewed', ur: 'سب سے زیادہ جائزے' },
  { value: 'newest',   ar: 'الأحدث',         en: 'Newest',        ur: 'تازہ ترین' },
  { value: 'alpha',    ar: 'أبجدي',          en: 'A → Z',         ur: 'حروف تہجی' },
]

const DEFAULT_FILTERS: DirectoryFilters = {
  minRating: null,
  openNow: false,
  verifiedOnly: false,
  hasPhotos: false,
  sort: 'newest',
}

export default function DirectoryFilterSheet({ open, initial, onClose, onApply }: Props) {
  const { lang } = useLanguage()
  const tr = (en: string, ar: string, ur: string) =>
    lang === 'en' ? en : lang === 'ur' ? ur : ar

  const [draft, setDraft] = useState<DirectoryFilters>(initial)

  // Swipe-down-to-dismiss state. dragY is how far the user's
  // finger has pulled the sheet from its rest position (always
  // ≥ 0 — upward drags are ignored so the sheet doesn't lift off).
  // animating disables the transform transition while the finger
  // is down so the sheet tracks the touch directly; we re-enable
  // it on touchend so the spring-back / fly-out is smooth.
  const [dragY, setDragY] = useState(0)
  const [animating, setAnimating] = useState(true)
  const dragStartY = useRef<number | null>(null)

  // Reset local staging to the incoming filters every time the
  // sheet opens, so a dismissed-without-apply session doesn't
  // bleed into the next open.
  useEffect(() => {
    if (open) {
      setDraft(initial)
      setDragY(0)
      setAnimating(true)
    }
  }, [open, initial])

  useBodyScrollLock(open)

  if (!open) return null
  if (typeof document === 'undefined' || !document.body) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[88vh]"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: animating ? 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
        }}
      >
        {/* Header (fixed-height; flex-shrink-0 keeps it from
            collapsing under content). Drag handle matches the
            other sheets in the app. The whole header doubles as
            the swipe-down-to-dismiss grab area — pulling on the
            scrollable content area should still scroll, so we
            don't put listeners there. */}
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
            // Only follow downward drags; upward pulls are ignored.
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
              // Fly out fully, then unmount via onClose so the
              // animation looks like the sheet exits cleanly
              // rather than vanishing mid-drag.
              setDragY(window.innerHeight)
              setTimeout(onClose, 200)
            } else {
              // Spring back to rest.
              setDragY(0)
            }
          }}
        >
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-2.5" />
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              {tr('Filter directory', 'تصفية الدليل', 'ڈائریکٹری فلٹر')}
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

        {/* Scrollable middle. iOS WKWebView needs the scroll to live
            inside a flex-1 child of a fixed-height column — not on
            the sheet root with sticky inner header/footer (that
            combo deadlocks with body.touch-action:none lock). */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* Minimum rating */}
          <section>
            <h3 className="text-[12px] font-bold text-gray-700 dark:text-gray-200 mb-2">
              {tr('Minimum rating', 'الحد الأدنى للتقييم', 'کم از کم درجہ بندی')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {RATING_PRESETS.map((p) => {
                const active = (draft.minRating ?? null) === p.value
                return (
                  <button
                    key={String(p.value)}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, minRating: p.value }))}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {lang === 'en' ? p.labelEn : p.labelAr}
                  </button>
                )
              })}
            </div>
            {draft.minRating !== null && (
              <p className="text-[10.5px] text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                {tr(
                  'Includes every place that has at least one review at this rating or above.',
                  'يشمل كل مكان حصل على تقييم واحد على الأقل بهذا المستوى أو أعلى.',
                  'وہ تمام جگہیں جنہیں اس درجے یا اس سے زیادہ کا کم از کم ایک جائزہ ملا ہے۔',
                )}
              </p>
            )}
          </section>

          {/* Toggles */}
          <section className="space-y-2.5">
            <ToggleRow
              label={tr('Open now', 'مفتوح الآن', 'ابھی کھلا')}
              checked={draft.openNow}
              onChange={(v) => setDraft((d) => ({ ...d, openNow: v }))}
            />
            <ToggleRow
              label={tr('Verified only', 'موثّق فقط', 'صرف تصدیق شدہ')}
              checked={draft.verifiedOnly}
              onChange={(v) => setDraft((d) => ({ ...d, verifiedOnly: v }))}
            />
            <ToggleRow
              label={tr('Has photos', 'يحتوي صور', 'تصاویر والی')}
              checked={draft.hasPhotos}
              onChange={(v) => setDraft((d) => ({ ...d, hasPhotos: v }))}
            />
          </section>

          {/* Sort */}
          <section>
            <h3 className="text-[12px] font-bold text-gray-700 dark:text-gray-200 mb-2">
              {tr('Sort', 'الترتيب', 'ترتیب')}
            </h3>
            <div className="space-y-1.5">
              {SORT_OPTIONS.map((s) => {
                const active = draft.sort === s.value
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, sort: s.value }))}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                      active
                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-transparent'
                    }`}
                  >
                    <span>{lang === 'en' ? s.en : lang === 'ur' ? s.ur : s.ar}</span>
                    <span
                      className={`w-4 h-4 rounded-full border-2 ${
                        active
                          ? 'border-primary-600 bg-primary-600'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                      aria-hidden
                    >
                      {active && (
                        <span className="block w-1.5 h-1.5 rounded-full bg-white m-auto mt-[3px]" />
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        </div>

        {/* Footer actions — flex-shrink-0 so they always sit at the
            sheet's bottom edge, with safe-area inset for iOS home
            indicator clearance. */}
        <div
          className="flex-shrink-0 flex gap-2 px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-b-3xl"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
        >
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_FILTERS)}
            className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-semibold active:scale-95 transition-transform"
          >
            {tr('Reset', 'إعادة تعيين', 'دوبارہ ترتیب')}
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft)
              onClose()
            }}
            className="flex-1 py-3 rounded-xl bg-primary-600 text-white text-sm font-bold active:scale-95 transition-transform"
          >
            {tr('Apply', 'تطبيق', 'لاگو کریں')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 cursor-pointer">
      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</span>
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
          checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0.5 rtl:-translate-x-0.5'
          }`}
        />
      </span>
    </label>
  )
}

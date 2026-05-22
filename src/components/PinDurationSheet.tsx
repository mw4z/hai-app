'use client'

import { createPortal } from 'react-dom'
import { useLanguage } from '@/hooks/useLanguage'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useDragToDismiss } from '@/hooks/useDragToDismiss'

const DURATIONS = [
  { key: '24h', ar: '٢٤ ساعة', en: '24 hours' },
  { key: '7d', ar: '٧ أيام', en: '7 days' },
  { key: '30d', ar: '٣٠ يوم', en: '30 days' },
  { key: 'forever', ar: 'دائم', en: 'Forever' },
]

/** Small bottom sheet to choose how long a pinned reference stays visible.
 *  Used when pinning a post (or other source) to "المثبتات". */
export default function PinDurationSheet({
  open, onClose, onSelect, busy = false,
}: { open: boolean; onClose: () => void; onSelect: (duration: string) => void; busy?: boolean }) {
  const { lang } = useLanguage()
  useBodyScrollLock(open)
  const drag = useDragToDismiss<HTMLDivElement, HTMLDivElement>({ open, onDismiss: onClose })
  const tr = (en: string, ar: string) => (lang === 'en' ? en : ar)
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[1200] bg-black/50 flex items-end justify-center" onClick={onClose} role="dialog" aria-modal="true">
      <div
        ref={drag.sheetRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] bg-white dark:bg-gray-900 rounded-t-3xl p-4 space-y-2 will-change-transform"
        style={{ paddingBottom: 'calc(var(--hai-safe-bottom, 0px) + 1rem)' }}
      >
        {/* Drag handle — swipe down to dismiss. */}
        <div ref={drag.handleRef} className="py-1.5 -mt-1.5 cursor-grab touch-none">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto" />
        </div>
        <h2 className="text-sm font-bold text-gray-900 dark:text-white text-center">{tr('Pin duration', 'مدة التثبيت')}</h2>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center mb-1.5">
          {tr('It will appear under "Pinned items" for residents.', 'سيظهر في قسم "المثبتات" للسكان.')}
        </p>
        {DURATIONS.map((d) => (
          <button
            key={d.key}
            disabled={busy}
            onClick={() => onSelect(d.key)}
            className="w-full py-3 rounded-xl bg-gray-50 dark:bg-gray-800 text-sm font-semibold text-gray-800 dark:text-gray-100 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {lang === 'en' ? d.en : d.ar}
          </button>
        ))}
        <button onClick={onClose} className="w-full py-2.5 text-sm text-gray-500">{tr('Cancel', 'إلغاء')}</button>
      </div>
    </div>,
    document.body,
  )
}

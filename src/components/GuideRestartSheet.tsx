'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'

/**
 * "إعادة شرح التطبيق" sheet — replaces the old image-slide
 * tutorial entry-point. Three actions, all localStorage only.
 * No new routes, no API calls.
 *
 *   1. شرح الصفحة الرئيسية
 *      → clears hai:first-run-guide-v1, routes to /feed.
 *        FirstRunGuide on /feed sees no key and auto-starts.
 *
 *   2. شرح هذه الصفحة
 *      → looks up the current pathname in PATH_TO_GUIDE. If a
 *        contextual guide exists for this page, clears its key
 *        and dispatches `hai:restart-guide` so the live component
 *        re-fires immediately. If no guide matches, shows a toast
 *        saying so — no error, no fallback navigation.
 *
 *   3. إظهار كل الإرشادات مرة ثانية
 *      → clears the global kill switch + the feed guide key + every
 *        `hai:context-guide:*:v1` key. Toast confirms. If a guide
 *        matches the current page, also dispatches the restart event
 *        so the user gets immediate confirmation it works.
 */

/** pathname → guideId mapping. Keep in sync with the Phase A/B
 *  contextual guides. Pathname is matched with startsWith() so
 *  /post/new and /post/new?category=... both resolve. */
const PATH_TO_GUIDE: { match: string; guideId: string }[] = [
  { match: '/ask', guideId: 'ask' },
  { match: '/post/new', guideId: 'post-new' },
  { match: '/rides/new', guideId: 'rides-new' },
  { match: '/profile', guideId: 'profile' },
]

const FIRST_RUN_KEY = 'hai:first-run-guide-v1'
const GLOBAL_KILL_KEY = 'hai:context-guides-disabled-v1'
const CTX_GUIDE_PREFIX = 'hai:context-guide:'

function detectGuideForPath(pathname: string | null): string | null {
  if (!pathname) return null
  for (const m of PATH_TO_GUIDE) {
    if (pathname === m.match || pathname.startsWith(m.match + '/') || pathname.startsWith(m.match + '?')) {
      return m.guideId
    }
  }
  return null
}

function clearAllContextGuideKeys() {
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(CTX_GUIDE_PREFIX) && k.endsWith(':v1')) {
        toRemove.push(k)
      }
    }
    for (const k of toRemove) localStorage.removeItem(k)
  } catch {
    // localStorage unavailable
  }
}

export default function GuideRestartSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const currentGuide = detectGuideForPath(pathname)

  // ESC closes the sheet. Backdrop tap closes too (this is a passive
  // menu, not a guided tour — accidental tap-out is OK here).
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

  function restartFeed() {
    try {
      localStorage.removeItem(FIRST_RUN_KEY)
    } catch {
      // ignore
    }
    onClose()
    router.push('/feed')
  }

  function restartCurrent() {
    if (!currentGuide) {
      toast(
        'لا يوجد شرح مخصص لهذه الصفحة حاليًا',
        { duration: 3000 },
      )
      onClose()
      return
    }
    try {
      localStorage.removeItem(`${CTX_GUIDE_PREFIX}${currentGuide}:v1`)
    } catch {
      // ignore
    }
    onClose()
    // Dispatch on next tick so the sheet closes first — otherwise
    // the guide's spotlight + body-scroll-lock would compete with
    // the sheet's pointer-events on the same frame.
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('hai:restart-guide', { detail: { guideId: currentGuide } }),
      )
    }, 0)
  }

  function restartAll() {
    try {
      localStorage.removeItem(GLOBAL_KILL_KEY)
      localStorage.removeItem(FIRST_RUN_KEY)
    } catch {
      // ignore
    }
    clearAllContextGuideKeys()
    toast.success('تم تفعيل الإرشادات من جديد')
    onClose()
    if (currentGuide) {
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('hai:restart-guide', { detail: { guideId: currentGuide } }),
        )
      }, 0)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hai-restart-sheet-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl p-5"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        dir="rtl"
      >
        <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-3 sm:hidden" />
        <h2
          id="hai-restart-sheet-title"
          className="text-base font-bold text-gray-900 dark:text-white mb-1"
        >
          إعادة شرح التطبيق
        </h2>
        <p className="text-[12px] text-gray-500 dark:text-gray-400 mb-4">
          اختر اللي تبي نَبْضي يشرحه لك من جديد.
        </p>

        <div className="space-y-2">
          <button
            type="button"
            onClick={restartFeed}
            className="w-full flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 active:scale-[0.98] transition-transform text-start"
          >
            <span className="text-xl flex-shrink-0">🏠</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-gray-900 dark:text-white">
                شرح الصفحة الرئيسية
              </span>
              <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                نعيدك للرئيسية ويبدأ نَبْضي من البداية.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={restartCurrent}
            className="w-full flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 active:scale-[0.98] transition-transform text-start"
          >
            <span className="text-xl flex-shrink-0">📍</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-gray-900 dark:text-white">
                شرح هذه الصفحة
              </span>
              <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                نعيد عرض إرشادات هذه الصفحة الآن.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={restartAll}
            className="w-full flex items-center gap-3 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 active:scale-[0.98] transition-transform text-start"
          >
            <span className="text-xl flex-shrink-0">✨</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-emerald-700 dark:text-emerald-300">
                إظهار كل الإرشادات مرة ثانية
              </span>
              <span className="block text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                نعيد تفعيل كل إرشادات نَبْضي على هذا الجهاز.
              </span>
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-4 py-2.5 text-sm font-medium text-gray-500 dark:text-gray-400 active:scale-95 transition-transform"
        >
          إغلاق
        </button>
      </div>
    </div>,
    document.body,
  )
}

'use client'

import { useEffect } from 'react'
import { FiWifiOff, FiRefreshCw } from 'react-icons/fi'

/**
 * Route-level error boundary for /directory and its children.
 *
 * The directory pages all SSR — they call `db.placeListing.findMany`
 * inside the server component. When the device is offline, that
 * fetch resolves to a Next.js routing error and the user sees a
 * blank-dark screen with no app chrome (the global OfflineBanner
 * lives in the root layout, but the route's own slot fails to
 * render anything). This boundary catches that case and shows a
 * full-bleed "no internet" card with a Retry button.
 *
 * Also catches genuine server errors (500s, P-codes from Prisma,
 * etc.) the same way — the symptom from the user's perspective is
 * the same "I can't get into directory" and the UI is identical.
 */
export default function DirectoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.warn('[DIRECTORY_ERROR]', error.message, error.digest)
    }
  }, [error])

  return (
    <main className="hai-directory-screen min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center px-6">
      <div
        aria-hidden
        className="fixed top-0 left-0 right-0 z-30 pointer-events-none bg-gray-50 dark:bg-gray-900"
        style={{ height: 'env(safe-area-inset-top, 0px)' }}
      />
      <div className="max-w-sm text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-600 dark:text-rose-300">
          <FiWifiOff className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-bold text-gray-900 dark:text-white">
            تعذّر تحميل الدليل
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            تحقّق من اتصالك بالإنترنت ثم حاول مرة أخرى.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-primary-600 text-white text-sm font-semibold active:scale-95 transition-transform"
        >
          <FiRefreshCw className="w-4 h-4" />
          إعادة المحاولة
        </button>
      </div>
    </main>
  )
}

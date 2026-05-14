'use client'

import { useEffect } from 'react'
import { FiWifiOff, FiRefreshCw } from 'react-icons/fi'

/** Mirror of /directory/error.tsx for the mod surface. Same UX:
 *  any SSR fetch failure (offline, P-code, etc.) renders a clear
 *  retry affordance instead of dropping the user on a blank screen. */
export default function ModDirectoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.warn('[MOD_DIRECTORY_ERROR]', error.message, error.digest)
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
        <p className="text-base font-bold text-gray-900 dark:text-white">
          تعذّر تحميل صفحة المراجعة
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          تحقّق من اتصالك بالإنترنت ثم حاول مرة أخرى.
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-primary-600 text-white text-sm font-semibold active:scale-95"
        >
          <FiRefreshCw className="w-4 h-4" />
          إعادة المحاولة
        </button>
      </div>
    </main>
  )
}

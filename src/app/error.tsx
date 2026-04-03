'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[AppError]', error.message, error.digest)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
          حدث خطأ غير متوقع
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Something went wrong. Please try again.
        </p>
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex-1 bg-primary-600 text-white py-2.5 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
          >
            حاول مرة أخرى
          </button>
          <button
            onClick={() => window.location.href = '/feed'}
            className="flex-1 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl text-sm font-medium"
          >
            الرئيسية
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

export default function ThreadsLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--bg)] pb-24">
      {/* Header */}
      <div className="bg-white dark:bg-[var(--surface)] border-b border-gray-100 dark:border-gray-800 px-4 pt-3 pb-3">
        <div className="flex items-center justify-between">
          <div className="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
        </div>
      </div>

      {/* Chat rows */}
      <div className="px-3 pt-2 space-y-0.5">
        {[1, 2, 3, 4, 5, 6, 7].map(i => (
          <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-xl">
            {/* Avatar with gradient ring */}
            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
            {/* Message info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-3 w-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              </div>
              <div className="flex items-center justify-between">
                <div className="h-3 w-40 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                {i <= 2 && <div className="w-5 h-5 bg-primary-100 dark:bg-primary-900/30 rounded-full animate-pulse" />}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* BottomNav is mounted globally in layout.tsx. */}
    </div>
  )
}

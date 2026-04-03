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

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[var(--surface)] border-t border-gray-100 dark:border-gray-800 px-4 py-2" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-end justify-around max-w-[480px] mx-auto">
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /><div className="w-8 h-2 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /></div>
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /><div className="w-8 h-2 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /></div>
          <div className="w-[52px] h-[52px] bg-primary-100 dark:bg-primary-900/30 rounded-full animate-pulse -mt-3" />
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 bg-primary-100 dark:bg-primary-900/30 rounded animate-pulse" /><div className="w-8 h-2 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /></div>
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /><div className="w-8 h-2 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /></div>
        </div>
      </div>
    </div>
  )
}

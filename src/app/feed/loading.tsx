'use client'

export default function FeedLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--bg)] pb-24">
      {/* Header — matches glass header */}
      <div className="bg-white dark:bg-[var(--surface)] border-b border-gray-100 dark:border-gray-800 px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-10 bg-primary-100 dark:bg-primary-900/30 rounded animate-pulse" />
              <div className="h-1 w-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
            <div className="h-3 w-16 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mt-1" />
          </div>
          <div className="w-9 h-9 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
        </div>
        {/* Category tabs */}
        <div className="flex gap-2 overflow-hidden pb-1">
          <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse flex-shrink-0" />
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className={`h-8 rounded-full animate-pulse flex-shrink-0 ${i === 1 ? 'w-16 bg-primary-100 dark:bg-primary-900/30' : 'w-20 bg-gray-100 dark:bg-gray-800'}`} />
          ))}
        </div>
      </div>

      {/* Post cards */}
      <div className="px-4 pt-3 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white dark:bg-[var(--surface)] rounded-2xl p-4 border border-gray-200/60 dark:border-white/[0.06]">
            {/* Author */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              <div className="flex-1">
                <div className="h-3.5 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1.5" />
                <div className="h-2.5 w-12 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              </div>
              <div className="h-6 w-8 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
            </div>
            {/* Title + body */}
            <div className="space-y-2 mb-3">
              <div className="h-4 w-4/5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-3.5 w-full bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              <div className="h-3.5 w-3/5 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            </div>
            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
              <div className="h-5 w-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              <div className="flex gap-3">
                <div className="h-5 w-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                <div className="h-5 w-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                <div className="h-5 w-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* BottomNav is mounted globally in layout.tsx and persists
          across route transitions — no skeleton needed here. */}
    </div>
  )
}

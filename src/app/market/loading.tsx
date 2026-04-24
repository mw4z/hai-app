'use client'

export default function MarketLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--bg)] pb-24">
      {/* Header — matches market glass header */}
      <div className="bg-white dark:bg-[var(--surface)] border-b border-gray-100 dark:border-gray-800">
        <div className="px-4 py-3">
          <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
          <div className="h-3 w-28 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        </div>
        {/* Filter tabs: الكل، بيع، طلبات، خدمات */}
        <div className="flex gap-2 px-4 pb-3">
          {[16, 12, 14, 14].map((w, i) => (
            <div key={i} className={`h-8 rounded-full animate-pulse flex-shrink-0 ${i === 0 ? 'bg-primary-100 dark:bg-primary-900/30' : 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}`} style={{ width: `${w * 4}px` }} />
          ))}
        </div>
      </div>

      {/* Post card list (same as feed, since market uses PostCard) */}
      <div className="px-4 py-4 space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white dark:bg-[var(--surface)] rounded-2xl p-4 border border-gray-200/60 dark:border-white/[0.06]">
            {/* Author */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              <div className="flex-1">
                <div className="h-3.5 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1.5" />
                <div className="h-2.5 w-14 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              </div>
              <div className="h-6 w-8 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
            </div>
            {/* Content */}
            <div className="space-y-2 mb-3">
              <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-3.5 w-full bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            </div>
            {/* Price tag placeholder */}
            {i % 2 === 0 && <div className="h-6 w-16 bg-primary-50 dark:bg-primary-900/20 rounded-lg animate-pulse mb-2" />}
            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
              <div className="h-5 w-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              <div className="flex gap-3">
                <div className="h-5 w-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                <div className="h-5 w-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* BottomNav is mounted globally in layout.tsx. */}
    </div>
  )
}

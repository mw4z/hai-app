'use client'

export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--bg)] pb-24">
      {/* Cover photo area */}
      <div className="h-32 bg-gray-200 dark:bg-gray-700 animate-pulse" />

      {/* Profile info */}
      <div className="bg-white dark:bg-[var(--surface)] px-4 pb-4 -mt-10 relative">
        {/* Avatar */}
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse border-4 border-white dark:border-[var(--surface)]" />
          <div className="h-5 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-2" />
          <div className="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mt-1.5" />
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-around mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="h-5 w-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-3 w-14 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Reputation card */}
      <div className="px-4 pt-3">
        <div className="bg-white dark:bg-[var(--surface)] rounded-2xl p-4 border border-gray-200/60 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-50 dark:bg-primary-900/20 rounded-full animate-pulse" />
            <div className="flex-1">
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
              <div className="h-2.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Menu sections */}
      <div className="px-4 pt-3 space-y-3">
        {/* Section 1: Main actions */}
        <div className="bg-white dark:bg-[var(--surface)] rounded-2xl border border-gray-200/60 dark:border-white/[0.06] overflow-hidden">
          {[1, 2, 3].map(i => (
            <div key={i} className={`flex items-center gap-3 px-4 py-3.5 ${i < 3 ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}>
              <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse flex-shrink-0" />
              <div className="h-4 w-28 bg-gray-100 dark:bg-gray-800 rounded animate-pulse flex-1" />
              <div className="w-4 h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* Section 2: Settings */}
        <div className="bg-white dark:bg-[var(--surface)] rounded-2xl border border-gray-200/60 dark:border-white/[0.06] overflow-hidden">
          {[1, 2].map(i => (
            <div key={i} className={`flex items-center gap-3 px-4 py-3.5 ${i < 2 ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}>
              <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse flex-shrink-0" />
              <div className="h-4 w-24 bg-gray-100 dark:bg-gray-800 rounded animate-pulse flex-1" />
              <div className="w-9 h-5 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[var(--surface)] border-t border-gray-100 dark:border-gray-800 px-4 py-2" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-end justify-around max-w-[480px] mx-auto">
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /><div className="w-8 h-2 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /></div>
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /><div className="w-8 h-2 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /></div>
          <div className="w-[52px] h-[52px] bg-primary-100 dark:bg-primary-900/30 rounded-full animate-pulse -mt-3" />
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /><div className="w-8 h-2 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /></div>
          <div className="flex flex-col items-center gap-1"><div className="w-5 h-5 bg-primary-100 dark:bg-primary-900/30 rounded animate-pulse" /><div className="w-8 h-2 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /></div>
        </div>
      </div>
    </div>
  )
}

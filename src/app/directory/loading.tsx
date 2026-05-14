/**
 * Skeleton shown while the SSR fetch on /directory (and children)
 * is in flight. Without this file, Next.js shows nothing during
 * the fetch — on slow / offline links that reads as "blank screen
 * for a few seconds, then maybe content (or the error boundary)".
 * The skeleton fills the gap so users see something is loading.
 */
export default function DirectoryLoading() {
  return (
    <main className="hai-directory-screen min-h-screen bg-gray-50 dark:bg-gray-900">
      <div
        aria-hidden
        className="fixed top-0 left-0 right-0 z-30 pointer-events-none bg-gray-50 dark:bg-gray-900"
        style={{ height: 'env(safe-area-inset-top, 0px)' }}
      />
      <div className="max-w-[640px] mx-auto px-4 py-4 space-y-4 animate-pulse">
        <div className="h-6 w-32 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-4 w-64 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-12 rounded-2xl bg-gray-200 dark:bg-gray-800" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-7 w-20 rounded-full bg-gray-200 dark:bg-gray-800 flex-shrink-0" />
          ))}
        </div>
        <div className="space-y-2.5 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-gray-200 dark:bg-gray-800" />
          ))}
        </div>
      </div>
    </main>
  )
}

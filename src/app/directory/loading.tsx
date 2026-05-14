/**
 * Skeleton shown while the SSR fetch on /directory (and children)
 * is in flight. Without this file, Next.js shows nothing during
 * the fetch — on slow / offline links that reads as "blank screen
 * for a few seconds, then maybe content (or the error boundary)".
 *
 * Layout MUST mirror the real page chrome: a safe-area cover, a
 * sticky header band (same height as DirectoryHeader: w-10 h-10
 * button + py-2.5 padding ⇒ 60px), THEN the body. Without the
 * header band the first body block slides under the Android
 * status bar / notch on Capacitor, which reads as "skeleton
 * cut at the top". The matching band keeps the body below the
 * status bar even before the real header mounts.
 */
export default function DirectoryLoading() {
  return (
    <main className="hai-directory-screen min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Safe-area cover — same one DirectoryHeader paints. */}
      <div
        aria-hidden
        className="fixed top-0 left-0 right-0 z-30 pointer-events-none bg-gray-50 dark:bg-gray-900"
        style={{ height: 'env(safe-area-inset-top, 0px)' }}
      />
      {/* Header skeleton band. Same height + color as the real
          DirectoryHeader so the page below doesn't shift when the
          real header hydrates in. */}
      <div className="sticky top-0 z-30 bg-gray-50 dark:bg-gray-900 border-b border-gray-200/60 dark:border-gray-700/60">
        <div className="max-w-[760px] mx-auto px-3 py-2.5 flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse" />
          <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
        </div>
      </div>
      <div className="max-w-[640px] mx-auto px-4 py-4 space-y-4 animate-pulse">
        <div className="h-6 w-32 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-4 w-64 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-12 rounded-2xl bg-gray-200 dark:bg-gray-800" />
        <div className="flex gap-2 overflow-hidden">
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

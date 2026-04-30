'use client'

/**
 * Chat conversation skeleton — paints in <50ms while page.tsx is
 * fetching the thread + first 100 messages. The bubble shapes
 * alternate left/right with varied widths so the placeholder reads
 * as a real conversation, not a regular grid. Composer bar at the
 * bottom keeps the safe-area wallet from snapping when real content
 * lands.
 */
export default function ChatLoading() {
  // Pre-baked rows so the layout doesn't shift between SSR + hydration.
  const rows: Array<{ isMe: boolean; w: number; lines: number }> = [
    { isMe: false, w: 60, lines: 1 },
    { isMe: true,  w: 45, lines: 1 },
    { isMe: false, w: 75, lines: 2 },
    { isMe: true,  w: 50, lines: 1 },
    { isMe: false, w: 35, lines: 1 },
    { isMe: true,  w: 70, lines: 2 },
    { isMe: false, w: 55, lines: 1 },
  ]

  return (
    <div
      className="flex flex-col bg-gray-100 dark:bg-gray-950"
      style={{ height: 'calc(100dvh - env(safe-area-inset-top, 0px))' }}
    >
      {/* Header — matches the chat header shape so the back button +
          avatar + name don't jump when real data arrives. */}
      <header className="glass px-4 py-2.5 flex items-center gap-3 z-10 shadow-sm flex-shrink-0">
        <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse flex-shrink-0" />
        <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
          <div className="h-2.5 w-16 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        </div>
        <div className="w-7 h-7 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
        <div className="w-7 h-7 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
      </header>

      {/* Messages area */}
      <div className="px-4 py-3 flex-1 min-h-0 overflow-hidden space-y-2">
        {rows.map((r, i) => (
          <div
            key={i}
            className={`flex ${r.isMe ? 'ltr:justify-end rtl:justify-start' : 'ltr:justify-start rtl:justify-end'}`}
          >
            <div
              className={`rounded-2xl px-3.5 py-2.5 animate-pulse ${
                r.isMe
                  ? 'bg-primary-200 dark:bg-primary-900/40'
                  : 'bg-white dark:bg-gray-800'
              }`}
              style={{ width: `${r.w}%` }}
            >
              {/* Body lines */}
              <div className={`h-3 rounded ${r.isMe ? 'bg-primary-100 dark:bg-primary-800/60' : 'bg-gray-200 dark:bg-gray-700'}`} />
              {r.lines > 1 && (
                <div className={`h-3 rounded mt-1.5 w-3/4 ${r.isMe ? 'bg-primary-100 dark:bg-primary-800/60' : 'bg-gray-200 dark:bg-gray-700'}`} />
              )}
              {/* Timestamp dot */}
              <div className={`h-2 w-8 rounded mt-1.5 ${r.isMe ? 'bg-primary-100/70 dark:bg-primary-800/40' : 'bg-gray-100 dark:bg-gray-700'}`} />
            </div>
          </div>
        ))}
      </div>

      {/* Composer bar — matches the real input footer so the safe-area
          padding doesn't visibly resize when the real component mounts. */}
      <div className="glass-bottom px-3 py-2 flex items-center gap-2 flex-shrink-0">
        <div className="w-9 h-9 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse flex-shrink-0" />
        <div className="flex-1 h-9 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
        <div className="w-9 h-9 bg-primary-100 dark:bg-primary-900/30 rounded-full animate-pulse flex-shrink-0" />
      </div>
    </div>
  )
}

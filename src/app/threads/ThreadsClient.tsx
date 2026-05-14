'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'
import { FiMessageSquare } from 'react-icons/fi'
import { fullName } from '@/lib/displayName'

interface Thread {
  id: string
  other: { id: string; name: string | null; lastName?: string | null; avatarUrl: string | null; neighborhoodId?: string | null }
  postTitle: string | null
  postCategory: string | null
  isExclusive: boolean
  /** Unread messages from the OTHER user in this thread. Drives the
   *  green counter bubble next to the row. 0 = nothing unread. */
  unreadCount?: number
  lastMessage: {
    text: string
    isMe: boolean
    createdAt: string
    deliveredAt?: string | null
    readAt?: string | null
  } | null
}

/**
 * WhatsApp-style check marks, sized for the conversation list row.
 *  - unsent/sending   → nothing (the row just shows no tick)
 *  - sent (server ack, not delivered)     → single grey tick
 *  - delivered (recipient fetched it)     → double grey tick
 *  - read (recipient opened + rr enabled) → double blue tick
 */
function ListCheck({ delivered, read }: { delivered: boolean; read: boolean }) {
  const color = read ? '#1E88E5' : '#9ca3af'
  if (!delivered) {
    return (
      <svg width="12" height="10" viewBox="0 0 11 11" className="inline-block flex-shrink-0" aria-hidden="true">
        <path d="M9 .786L4.236 7.856 2 5.394" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width="16" height="10" viewBox="0 0 16 11" className="inline-block flex-shrink-0" aria-hidden="true">
      <path d="M11 .786l-4.764 7.07L4 5.394" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 .786l-4.764 7.07L8 5.394" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function timeAgo(dateStr: string, lang: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return lang === 'en' ? 'now' : 'الآن'
  if (mins < 60) return lang === 'en' ? `${mins}m` : `${mins}د`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return lang === 'en' ? `${hrs}h` : `${hrs}س`
  const days = Math.floor(hrs / 24)
  if (days < 7) return lang === 'en' ? `${days}d` : `${days}ي`
  return new Date(dateStr).toLocaleDateString(lang === 'en' ? 'en' : 'ar-SA', { month: 'short', day: 'numeric' })
}

const CATEGORY_ICONS: Record<string, string> = {
  MARKETPLACE: '🛒',
  SERVICES: '🛠',
  HOME_BUSINESSES: '🍲',
  RIDES: '🚗',
  REAL_ESTATE: '🏠',
  LOST_FOUND: '📦',
  NEIGHBORHOOD_REPORTS: '🚨',
  EVENTS: '🎉',
  COMPETITIONS: '🏆',
  GENERAL: '💬',
}

export default function ThreadsClient({
  threads: initialThreads,
  currentUserNeighborhoodId,
}: {
  threads: Thread[]
  currentUserNeighborhoodId: string | null
}) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const [threads, setThreads] = useState(initialThreads)

  // Opening the threads list is a meaningful moment for the
  // notification-permission nudge — engaging with messages
  // implies the user cares about notifications.
  useEffect(() => {
    try {
      window.dispatchEvent(new Event('hai:nudge-trigger'))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    async function refresh() {
      try {
        const res = await fetch('/api/threads')
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data)) setThreads(data)
        }
      } catch { /* ignore */ }
    }

    // Immediate fetch on mount — the SSR data may be stale if the user
    // just closed a thread and navigated back.
    refresh()

    // Poll every 5s while the tab is visible. Tighter than before so
    // the check-mark states (sent → delivered → seen) catch up without
    // opening the chat. Polling pauses when the tab isn't visible.
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      refresh()
    }, 5000)

    // Refresh immediately on visibility + on realtime signals.
    // PushRegistration dispatches 'hai:new-message' on foreground DM
    // push receipt so an incoming message flips the row state (and
    // bumps timestamp) without waiting for the next poll tick.
    function onVisibility() {
      if (document.visibilityState === 'visible') refresh()
    }
    function onPushNewMessage() { refresh() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('hai:new-message', onPushNewMessage)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('hai:new-message', onPushNewMessage)
    }
  }, [])

  return (
    <div className="hai-app-shell bg-white dark:bg-gray-900">
      {/* Header */}
      <header className="glass z-10 px-5 pt-4 pb-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('thread_title')}</h1>
      </header>

      <div className="hai-app-shell__scroll pb-24 overscroll-y-contain">
      {threads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-6">
          <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
            <FiMessageSquare className="w-10 h-10 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-center font-medium">{t('thread_empty')}</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1">
            {lang === 'en' ? 'Start a conversation from any post' : 'ابدأ محادثة من أي منشور'}
          </p>
        </div>
      ) : (
        <div>
          {threads.map((thread, idx) => (
            <Link
              key={thread.id}
              href={`/threads/${thread.id}`}
              className="flex items-center gap-3 px-5 py-3.5 active:bg-gray-100 dark:active:bg-gray-800 border-b border-gray-50 dark:border-gray-800/50 focus:outline-none focus-visible:outline-none"
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                {thread.other.avatarUrl ? (
                  <img src={thread.other.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-lg shadow-sm glow-avatar">
                    {thread.other.name?.[0] || '؟'}
                  </div>
                )}
                {thread.isExclusive && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-amber-400 rounded-full border-2 border-white dark:border-gray-900 flex items-center justify-center">
                    <span className="text-[8px]">⚡</span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-[15px] font-semibold text-gray-900 dark:text-white truncate">
                      {fullName(thread.other) || (lang === 'en' ? 'Neighbor' : 'جار')}
                    </p>
                    {/* Cross-neighborhood badge: only show when both
                        sides have a neighborhoodId on file AND they
                        differ. Missing recipient nbhd → assume own
                        (legacy threads pre-Phase). */}
                    {currentUserNeighborhoodId && thread.other.neighborhoodId && thread.other.neighborhoodId !== currentUserNeighborhoodId && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex-shrink-0"
                        title={lang === 'en' ? 'Outside your neighborhood' : 'من خارج الحي'}
                      >
                        {lang === 'en' ? 'Outside' : 'خارج الحي'}
                      </span>
                    )}
                  </div>
                  {thread.lastMessage && (
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0 mr-1">
                      {timeAgo(thread.lastMessage.createdAt, lang)}
                    </span>
                  )}
                </div>
                {thread.postTitle && (
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-xs">{CATEGORY_ICONS[thread.postCategory || ''] || '💬'}</span>
                    <p className="text-xs text-primary-600 dark:text-primary-400 truncate font-medium">{thread.postTitle}</p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {thread.lastMessage && (
                    <p className={`text-[13px] truncate leading-tight flex items-center gap-1 flex-1 min-w-0 ${
                      (thread.unreadCount || 0) > 0 && !thread.lastMessage.isMe
                        ? 'text-gray-900 dark:text-white font-semibold'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {thread.lastMessage.isMe && (
                        <ListCheck
                          delivered={!!thread.lastMessage.deliveredAt || !!thread.lastMessage.readAt}
                          read={!!thread.lastMessage.readAt}
                        />
                      )}
                      <span className="truncate">
                        {thread.lastMessage.isMe ? '' : ''}
                        {thread.lastMessage.text}
                      </span>
                    </p>
                  )}
                  {/* Unread counter — primary-tinted pill with the
                      number of unread messages from the other user.
                      Hidden when 0. Caps display at 99+ to stay narrow. */}
                  {(thread.unreadCount || 0) > 0 && (
                    <span
                      className="ms-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary-600 text-white text-[11px] font-bold flex-shrink-0 tabular-nums"
                      aria-label={lang === 'en'
                        ? `${thread.unreadCount} unread`
                        : `${thread.unreadCount} غير مقروءة`}
                    >
                      {(thread.unreadCount || 0) > 99 ? '99+' : thread.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      </div>{/* /hai-app-shell__scroll */}

      {/* BottomNav is mounted globally in src/app/layout.tsx */}
    </div>
  )
}

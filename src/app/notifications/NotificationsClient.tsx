'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import SwipeToDelete from '@/components/SwipeToDelete'
import { useLanguage } from '@/hooks/useLanguage'
import BackButton from '@/components/BackButton'
import { FiMessageCircle, FiHeart, FiCornerDownRight, FiSearch, FiTrash2, FiNavigation, FiStar, FiBell } from 'react-icons/fi'
import type { TranslationKey } from '@/lib/i18n'

interface Notification {
  id: string
  type: string
  read: boolean
  actorId: string
  actorName: string | null
  postId: string | null
  postTitle: string | null
  threadId: string | null
  rideRequestId: string | null
  title: string | null
  titleEn: string | null
  body: string | null
  bodyEn: string | null
  createdAt: string
}

// Icon per notification type
const NOTIF_ICON: Record<string, React.ReactNode> = {
  COMMENT_ON_POST:  <FiMessageCircle className="w-5 h-5 text-primary-600" />,
  REACTION_ON_POST: <FiHeart className="w-5 h-5 text-red-500" />,
  REPLY_TO_COMMENT: <FiCornerDownRight className="w-5 h-5 text-sky-600" />,
  LOOKING_FOR_POST: <FiSearch className="w-5 h-5 text-amber-500" />,
  NEW_MESSAGE:      <FiMessageCircle className="w-5 h-5 text-primary-600" />,
  RIDE_OFFER:       <span className="text-lg">🚗</span>,
  RIDE_STATUS:      <FiNavigation className="w-5 h-5 text-indigo-500" />,
  RIDE_MESSAGE:     <FiMessageCircle className="w-5 h-5 text-indigo-500" />,
  RIDE_RATING:      <FiStar className="w-5 h-5 text-amber-500" />,
  SYSTEM:           <FiBell className="w-5 h-5 text-primary-600" />,
}

// Fallback text for types that don't have title/body (old notifications)
const NOTIF_TEXT: Record<string, TranslationKey> = {
  COMMENT_ON_POST:  'notif_comment_on_post',
  REACTION_ON_POST: 'notif_react_on_post',
  REPLY_TO_COMMENT: 'notif_reply_to_comment',
  LOOKING_FOR_POST: 'notif_looking_for_post',
  NEW_MESSAGE:      'notif_new_message',
}

export default function NotificationsClient({
  initialNotifications,
}: {
  initialNotifications: Notification[]
}) {
  const { t, lang } = useLanguage()
  const [notifications, setNotifications] = useState(initialNotifications)

  // Auto-refresh notifications every 5 seconds
  const refreshNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
      }
    } catch { /* */ }
  }, [])
  useAutoRefresh(refreshNotifications, 5000)

  // Mark as read on view
  useAutoRefresh(useCallback(async () => {
    const unread = notifications.filter(n => !n.read).map(n => n.id)
    if (unread.length === 0) return
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unread }),
    })
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [notifications]), 3000)

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return t('post_ago_just')
    if (mins < 60) {
      return lang === 'ar'
        ? `${t('post_ago_prefix')} ${mins} ${t('post_ago_min')}`
        : `${mins}${t('post_ago_min')} ${t('post_ago_suffix')}`
    }
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) {
      return lang === 'ar'
        ? `${t('post_ago_prefix')} ${hrs} ${t('post_ago_hour')}`
        : `${hrs}${t('post_ago_hour')} ${t('post_ago_suffix')}`
    }
    const days = Math.floor(hrs / 24)
    return lang === 'ar'
      ? `${t('post_ago_prefix')} ${days} ${t('post_ago_day')}`
      : `${days}${t('post_ago_day')} ${t('post_ago_suffix')}`
  }

  async function deleteOne(id: string) {
    try {
      const res = await fetch('/api/notifications/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: id }),
      })
      if (res.ok) setNotifications(prev => prev.filter(n => n.id !== id))
    } catch { /* ignore */ }
  }

  async function clearAll() {
    try {
      const res = await fetch('/api/notifications/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      if (res.ok) setNotifications([])
    } catch { /* ignore */ }
  }

  // Determine link target for each notification
  function getLink(n: Notification): string {
    if (n.rideRequestId) return `/rides/${n.rideRequestId}`
    if (n.threadId) return `/threads/${n.threadId}`
    if (n.postId) return `/feed`
    return '/feed'
  }

  // Get display title — use stored title/body if available, fallback to old system
  function getTitle(n: Notification): string {
    const title = lang === 'en' && n.titleEn ? n.titleEn : n.title
    if (title) return title
    // Fallback: actor name + action text
    const actorName = n.actorName || t('post_neighbor')
    const actionText = NOTIF_TEXT[n.type] ? t(NOTIF_TEXT[n.type]) : ''
    return `${actorName} ${actionText}`
  }

  function getBody(n: Notification): string | null {
    const body = lang === 'en' && n.bodyEn ? n.bodyEn : n.body
    if (body) return body
    if (n.postTitle) return n.postTitle
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-8">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 sticky top-0 z-10 border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
        <BackButton href="/feed" />
        <h1 className="text-lg font-bold text-gray-900 dark:text-white flex-1">{t('notif_title')}</h1>
        {notifications.length > 0 && (
          <button onClick={clearAll} className="text-xs text-red-500 flex items-center gap-1">
            <FiTrash2 className="w-3.5 h-3.5" />
            {t('notif_clear_all')}
          </button>
        )}
      </header>

      {/* List */}
      <div className="px-4 py-4 space-y-2">
        {notifications.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🔔</div>
            <p className="text-gray-500 font-medium">{t('notif_empty')}</p>
          </div>
        ) : (
          notifications.map((n, idx) => (
            <div key={n.id} style={{ animationDelay: `${Math.min(idx * 40, 300)}ms`, animationFillMode: 'backwards' }} className="animate-fade-in-up">
              <SwipeToDelete onDelete={() => deleteOne(n.id)}>
                <Link
                  href={getLink(n)}
                  className={`flex items-start gap-3 p-3.5 rounded-2xl ${
                    !n.read
                      ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800'
                      : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    {NOTIF_ICON[n.type] || <FiBell className="w-5 h-5 text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 dark:text-white font-medium">
                      {getTitle(n)}
                    </p>
                    {getBody(n) && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{getBody(n)}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                </Link>
              </SwipeToDelete>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

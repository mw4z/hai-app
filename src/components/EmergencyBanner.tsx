'use client'

import { useEffect, useState, useCallback } from 'react'
import { FiAlertTriangle, FiX } from 'react-icons/fi'
import { useLanguage } from '@/hooks/useLanguage'

interface Alert {
  id: string
  title: string
  body: string
  severity: string
  expiresAt: string
  authorName: string | null
}

export default function EmergencyBanner() {
  const { lang } = useLanguage()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchActive = useCallback(async () => {
    try {
      const res = await fetch('/api/emergency/active')
      if (!res.ok) return
      const data = await res.json()
      if (Array.isArray(data)) setAlerts(data)
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchActive()
    // Refresh on focus (user returns to app)
    const onFocus = () => fetchActive()
    window.addEventListener('focus', onFocus)
    // Also refresh every 2 minutes while open
    const interval = setInterval(fetchActive, 2 * 60_000)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(interval)
    }
  }, [fetchActive])

  async function dismiss(id: string) {
    // Optimistic remove
    setAlerts((prev) => prev.filter((a) => a.id !== id))
    try {
      await fetch(`/api/emergency/${id}/dismiss`, { method: 'POST' })
    } catch {
      // re-fetch on error to stay in sync
      fetchActive()
    }
  }

  if (alerts.length === 0) return null

  return (
    <div className="px-4 pt-3 space-y-2">
      {alerts.map((alert) => {
        const isCritical = alert.severity === 'critical'
        const isWarning = alert.severity === 'warning'
        const bg = isCritical
          ? 'bg-red-600'
          : isWarning
            ? 'bg-amber-500'
            : 'bg-blue-600'
        const ring = isCritical
          ? 'ring-red-300/60 dark:ring-red-900/60'
          : isWarning
            ? 'ring-amber-300/60 dark:ring-amber-900/60'
            : 'ring-blue-300/60 dark:ring-blue-900/60'

        const isOpen = expanded === alert.id

        return (
          <div
            key={alert.id}
            className={`${bg} ${ring} ring-2 text-white rounded-2xl shadow-lg overflow-hidden relative`}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => setExpanded(isOpen ? null : alert.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setExpanded(isOpen ? null : alert.id)
                }
              }}
              className="w-full text-right px-4 py-3 pe-10 flex items-start gap-3 active:opacity-90 cursor-pointer"
            >
              <div className="flex-shrink-0 mt-0.5">
                <FiAlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-sm">
                    {lang === 'en' ? '🚨 Emergency alert' : '🚨 تنبيه عاجل'}
                  </p>
                  <span className="text-[10px] opacity-80 font-medium">
                    {alert.authorName || (lang === 'en' ? 'Mod' : 'المشرف')}
                  </span>
                </div>
                <p className="font-semibold text-sm mt-1 line-clamp-2">
                  {alert.title}
                </p>
                {isOpen && alert.body && (
                  <p className="text-xs mt-2 whitespace-pre-wrap opacity-95">
                    {alert.body}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismiss(alert.id)}
              className="absolute top-2 end-2 p-1.5 rounded-full hover:bg-white/10 active:bg-white/20 z-10"
              aria-label={lang === 'en' ? 'Dismiss' : 'إخفاء'}
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

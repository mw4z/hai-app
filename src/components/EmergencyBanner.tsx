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

  /** Map the raw severity string to a semantic design-system state. */
  function severityState(severity: string): 'emergency' | 'warning' | 'info' {
    if (severity === 'critical') return 'emergency'
    if (severity === 'warning')  return 'warning'
    return 'info'
  }

  return (
    <div className="hai-stack-2 hai-px-4 hai-pt-3">
      {alerts.map((alert) => {
        const state = severityState(alert.severity)
        const pulse = state === 'emergency' || state === 'warning'
        const isOpen = expanded === alert.id

        return (
          <div
            key={alert.id}
            data-state={state}
            className={`hai-state-banner ${pulse ? 'hai-state-banner--pulse' : ''}`}
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
              className="hai-state-banner__hit"
            >
              <div className="hai-state-banner__icon">
                <FiAlertTriangle className="hai-icon-lg" />
              </div>
              <div className="hai-state-banner__body">
                <div className="hai-row-2 hai-justify-between">
                  <p className="hai-state-banner__title">
                    {lang === 'en' ? '🚨 Emergency alert' : '🚨 تنبيه عاجل'}
                  </p>
                  <span className="hai-state-banner__meta">
                    {alert.authorName || (lang === 'en' ? 'Mod' : 'المشرف')}
                  </span>
                </div>
                <p className="hai-state-banner__text line-clamp-2">
                  {alert.title}
                </p>
                {isOpen && alert.body && (
                  <p className="hai-state-banner__body-text">
                    {alert.body}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismiss(alert.id)}
              className="hai-state-banner__close"
              aria-label={lang === 'en' ? 'Dismiss' : 'إخفاء'}
            >
              <FiX className="hai-icon-md" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

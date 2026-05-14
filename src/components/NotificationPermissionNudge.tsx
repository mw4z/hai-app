'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import HaiGuideMascot from '@/components/HaiGuideMascot'
import { GUIDE_NAME_AR } from '@/lib/guideIdentity'
import { openNotificationSettings } from '@/lib/openAppSettings'

/**
 * Soft, occasional nudge to enable push notifications on native
 * platforms. NOT a blocking modal. Renders as a bottom-sheet card
 * with the مرشد حي identity and three actions:
 *
 *   • تفعيل التنبيهات (primary)
 *       - prompt=default  → request OS permission
 *       - prompt=denied   → open app notification settings
 *   • لاحقًا   (secondary, counts toward snooze)
 *   • لا تذكرني (tertiary, permanent silence at v1)
 *
 * Display rules:
 *   • Mobile/native only — web returns null
 *   • At most once per 7 days
 *   • After 3 "لاحقًا" taps → snoozed for 30 days
 *   • "لا تذكرني" → hai:notification-nudge:disabled-v1 set
 *   • Permission granted at any check → silenced, never shown
 *   • Skipped while FirstRunGuide / ContextualGuide is visible
 *   • Skipped while an emergency / warning banner is visible
 *   • Wait at least 60s after app start before first paint
 *
 * Trigger: this component listens for a custom event
 * `hai:nudge-trigger` that meaningful surfaces dispatch on safe
 * moments (post-publish, ride submit, opening notifications
 * page, etc). It will also self-trigger on first idle ~60s after
 * mount when the user appears to be casually browsing.
 */

const KEY_LAST_SHOWN = 'hai:notification-nudge:last-shown'
const KEY_DISMISS_COUNT = 'hai:notification-nudge:dismissed-count'
const KEY_SNOOZED_UNTIL = 'hai:notification-nudge:snoozed-until'
const KEY_DISABLED = 'hai:notification-nudge:disabled-v1'
const KEY_GRANTED_AT = 'hai:notification-nudge:granted-since'

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000
const MIN_UPTIME_MS = 60 * 1000
const DISMISS_LIMIT = 3

type Perm = 'granted' | 'denied' | 'prompt' | 'unsupported'

async function checkPermission(): Promise<Perm> {
  try {
    if (typeof window === 'undefined') return 'unsupported'
    if (!window.Capacitor?.isNativePlatform()) return 'unsupported'
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const res = await PushNotifications.checkPermissions()
    // Plugin returns 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'
    if (res.receive === 'granted') return 'granted'
    if (res.receive === 'denied') return 'denied'
    return 'prompt'
  } catch {
    return 'unsupported'
  }
}

function isOverlayActive(): boolean {
  if (typeof document === 'undefined') return false
  // Match the wrapper class names FirstRunGuide / ContextualGuide
  // paint into their portals.
  if (document.querySelector('.hai-firstrun')) return true
  if (document.querySelector('.hai-context-guide')) return true
  // Emergency / warning banners use data-state attributes.
  if (document.querySelector('[data-state="emergency"], [data-state="warning"]')) return true
  return false
}

export default function NotificationPermissionNudge() {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const mountedAtRef = useRef<number>(0)

  useEffect(() => {
    setMounted(true)
    mountedAtRef.current = Date.now()
  }, [])

  // Decide whether to show. Returns true if the nudge can paint.
  const canShow = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false
    if (!window.Capacitor?.isNativePlatform()) return false
    try {
      if (localStorage.getItem(KEY_DISABLED)) return false
      const granted = localStorage.getItem(KEY_GRANTED_AT)
      if (granted) return false
      const snoozedUntil = Number(localStorage.getItem(KEY_SNOOZED_UNTIL) || '0')
      if (Number.isFinite(snoozedUntil) && snoozedUntil > Date.now()) return false
      const lastShown = Number(localStorage.getItem(KEY_LAST_SHOWN) || '0')
      if (Number.isFinite(lastShown) && Date.now() - lastShown < COOLDOWN_MS) return false
    } catch {
      // localStorage unavailable — proceed defensively (better
      // to show once than to silently never ask).
    }
    if (Date.now() - mountedAtRef.current < MIN_UPTIME_MS) return false
    if (isOverlayActive()) return false
    const perm = await checkPermission()
    if (perm !== 'prompt' && perm !== 'denied') {
      // granted or unsupported → silence
      if (perm === 'granted') {
        try {
          localStorage.setItem(KEY_GRANTED_AT, String(Date.now()))
        } catch {
          // ignore
        }
      }
      return false
    }
    return true
  }, [])

  // Triggers: explicit custom-event dispatch from other surfaces,
  // and a safety-net auto-check 60s after mount.
  useEffect(() => {
    if (!mounted) return
    let cancelled = false

    async function attempt() {
      if (cancelled || open) return
      if (await canShow()) {
        try {
          localStorage.setItem(KEY_LAST_SHOWN, String(Date.now()))
        } catch {
          // ignore
        }
        if (!cancelled) setOpen(true)
      }
    }

    // Auto-check on a delay so a freshly-opened app gets a chance
    // to settle (guides finish, emergency banner sweeps run).
    const t = setTimeout(attempt, MIN_UPTIME_MS + 4_000)

    function onTrigger() {
      void attempt()
    }
    window.addEventListener('hai:nudge-trigger', onTrigger)

    return () => {
      cancelled = true
      clearTimeout(t)
      window.removeEventListener('hai:nudge-trigger', onTrigger)
    }
  }, [mounted, open, canShow])

  // ── Actions ──────────────────────────────────────────────────
  const handleEnable = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      const perm = await checkPermission()
      if (perm === 'prompt') {
        try {
          const { PushNotifications } = await import('@capacitor/push-notifications')
          const res = await PushNotifications.requestPermissions()
          if (res.receive === 'granted') {
            try {
              localStorage.setItem(KEY_GRANTED_AT, String(Date.now()))
            } catch {
              // ignore
            }
            toast.success('تم تفعيل التنبيهات')
            // PushRegistration listens for focus + auth-ready —
            // we trigger a focus-style retry so the device-token
            // registration runs without a full app restart.
            try {
              window.dispatchEvent(new Event('focus'))
            } catch {
              // ignore
            }
            setOpen(false)
            return
          }
          // User denied at the OS prompt — treat like "لاحقًا"
          // (don't punish them with the +1 dismiss count; the OS
          // already gave them friction).
          setOpen(false)
          return
        } catch (err) {
          console.error('[notif-nudge] requestPermissions failed:', err)
          toast.error('تعذر فتح طلب الإذن')
          setOpen(false)
          return
        }
      }
      if (perm === 'denied') {
        const opened = await openNotificationSettings()
        if (!opened) {
          toast('افتح إعدادات الجهاز → التطبيقات → حي → التنبيهات')
        }
        setOpen(false)
        return
      }
      // granted or unsupported — shouldn't be reachable, but
      // close defensively.
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }, [busy])

  const handleLater = useCallback(() => {
    try {
      const current = Number(localStorage.getItem(KEY_DISMISS_COUNT) || '0')
      const next = (Number.isFinite(current) ? current : 0) + 1
      localStorage.setItem(KEY_DISMISS_COUNT, String(next))
      if (next >= DISMISS_LIMIT) {
        localStorage.setItem(KEY_SNOOZED_UNTIL, String(Date.now() + SNOOZE_MS))
      }
    } catch {
      // ignore
    }
    setOpen(false)
  }, [])

  const handleNeverAgain = useCallback(() => {
    try {
      localStorage.setItem(KEY_DISABLED, '1')
    } catch {
      // ignore
    }
    setOpen(false)
  }, [])

  if (!mounted) return null
  if (typeof document === 'undefined' || !document.body) return null
  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9000] flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="false"
      aria-labelledby="hai-nudge-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        dir="rtl"
      >
        <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-3 sm:hidden" />

        <div className="flex items-start gap-3 mb-3">
          <HaiGuideMascot size={56} direction="idle" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 leading-tight">
              {GUIDE_NAME_AR}
            </p>
            <h2
              id="hai-nudge-title"
              className="text-base font-bold text-gray-900 dark:text-white mt-0.5 leading-tight"
            >
              التنبيهات غير مفعلة
            </h2>
          </div>
        </div>

        <p className="text-[13px] text-gray-600 dark:text-gray-300 leading-relaxed mb-4">
          قد تفوتك رسائل الجيران، الردود على طلباتك، وتحديثات المشاوير.
        </p>

        <button
          type="button"
          onClick={handleEnable}
          disabled={busy}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[14px] font-bold py-3 rounded-2xl active:scale-95 transition-transform mb-2"
        >
          {busy ? '...' : 'تفعيل التنبيهات'}
        </button>
        <button
          type="button"
          onClick={handleLater}
          className="w-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-[13px] font-semibold py-2.5 rounded-2xl active:scale-95 transition-transform mb-2"
        >
          لاحقًا
        </button>
        <button
          type="button"
          onClick={handleNeverAgain}
          className="w-full text-[12px] font-medium text-gray-400 dark:text-gray-500 py-2 active:scale-95 transition-transform"
        >
          لا تذكرني
        </button>
      </div>
    </div>,
    document.body,
  )
}

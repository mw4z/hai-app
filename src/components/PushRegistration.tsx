'use client'

import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'

/**
 * Handles FCM/APNs registration on native platforms only.
 *
 * Flow:
 *  1. Wait until Capacitor is ready and the user is authenticated.
 *  2. Request push permission.
 *  3. Register with FCM/APNs.
 *  4. POST the received token to /api/devices/register for server persistence.
 *  5. Handle tap-to-open deeplinks from notifications.
 *
 * No-op on web / unauthenticated sessions.
 */
export default function PushRegistration() {
  const registeredRef = useRef(false)
  const deeplinkReadyRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.Capacitor?.isNativePlatform()) return

    // ── Eager deeplink listener ───────────────────────────────────────
    // Runs BEFORE auth gating. When the user taps a DM push on Android
    // and the app was cold-killed, Capacitor's Push plugin dispatches
    // the cached actionPerformed event once any listener is attached.
    // If we wait for the auth round-trip to finish, Samsung/Xiaomi
    // WebViews have already navigated to the cached last-URL (usually
    // /feed) and the tap is effectively lost. This listener has no
    // auth dependency — it just translates the deeplink and navigates —
    // so it's safe to attach immediately. The auth-gated token
    // registration below still waits for isSignedIn().
    const installDeeplinkListener = async () => {
      if (deeplinkReadyRef.current) return
      deeplinkReadyRef.current = true
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications')

        await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action) => {
            const data = (action?.notification?.data || {}) as Record<string, string>
            console.log('[PUSH] tap → resolving deeplink:', data?.type, data?.deeplink)
            const target = resolveDeeplink(data)
            if (!target) return
            try {
              // Skip re-nav if we're already on the exact target — avoids
              // an unnecessary reload if the app was already on the page.
              const currentPath = window.location.pathname + window.location.search
              if (currentPath === target) return
              window.location.href = target
            } catch (err) {
              console.error('[PUSH] navigation failed:', err)
            }
          },
        )

        // Foreground: Android (and iOS by default) suppresses the system
        // banner when the app is open. Surface the push as an in-app
        // toast so the user actually sees it.
        await PushNotifications.addListener(
          'pushNotificationReceived',
          (notification) => {
            const type = notification?.data?.type
            console.log('[PUSH] foreground received:', type)
            try {
              const title = notification?.title || (notification?.data as any)?.title
              const body = notification?.body || (notification?.data as any)?.body
              const text = [title, body].filter(Boolean).join(' — ')
              if (text) toast(text, { duration: 5000, icon: '🔔' })
            } catch (err) {
              console.error('[PUSH] foreground toast failed:', err)
            }

            // Bridge push → DOM events so screens can react live
            // without polling. Profile uses hai:mod-request-resolved
            // to refetch /api/mod-request the instant the admin
            // approves/rejects. Threads list uses hai:new-message so
            // an incoming DM flips the row state + check marks right
            // away instead of waiting for the next 5s poll.
            try {
              if (type === 'mod_request_resolved') {
                window.dispatchEvent(new CustomEvent('hai:mod-request-resolved', {
                  detail: notification?.data,
                }))
              } else if (type === 'new_message') {
                window.dispatchEvent(new CustomEvent('hai:new-message', {
                  detail: notification?.data,
                }))
              }
            } catch {}
          },
        )
      } catch (err) {
        console.error('[PUSH] deeplink listener install failed:', err)
        deeplinkReadyRef.current = false
      }
    }
    installDeeplinkListener()

    // The hai_token cookie is HttpOnly, so we can't see it from JS.
    // Probe a real authenticated endpoint instead — /api/notifications/unread
    // already runs on every tab and is cheap. 200 = signed in.
    const isSignedIn = async (): Promise<boolean> => {
      try {
        const res = await fetch('/api/notifications/unread', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        })
        return res.ok
      } catch {
        return false
      }
    }

    const init = async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications')
        const platform = window.Capacitor?.getPlatform() || 'android'

        const perm = await PushNotifications.requestPermissions()
        if (perm.receive !== 'granted') {
          console.log('[PUSH] permission not granted:', perm.receive)
          return
        }

        await PushNotifications.register()

        // Create a high-importance Android channel for emergency alerts.
        // Safe to call repeatedly — no-op if already present.
        if (platform === 'android') {
          try {
            // Default channel — every non-emergency push targets this.
            // Android 8+ requires an explicit channel; without one, FCM
            // auto-creates a hidden "Misc" channel that users often see
            // as "notifications aren't working" because it's buried in
            // the app's Settings → Notifications list.
            await PushNotifications.createChannel({
              id: 'hai_default',
              name: 'General Notifications',
              description: 'Neighborhood activity, messages, rides',
              importance: 4,         // HIGH — banner + sound by default
              visibility: 1,
              sound: 'default',
              vibration: true,
              lights: true,
            })
            await PushNotifications.createChannel({
              id: 'emergency',
              name: 'Emergency Alerts',
              description: 'Urgent neighborhood alerts',
              importance: 5,         // MAX — full-screen capable
              visibility: 1,
              sound: 'default',
              vibration: true,
              lights: true,
            })
          } catch {}
        }

        await PushNotifications.addListener('registration', async (token) => {
          try {
            const res = await fetch('/api/devices/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: token.value, platform }),
            })
            if (!res.ok) {
              console.error('[PUSH] server register failed:', res.status)
              return
            }
            console.log('[PUSH] device registered')
          } catch (err) {
            console.error('[PUSH] registration post failed:', err)
          }
        })

        await PushNotifications.addListener('registrationError', (err) => {
          console.error('[PUSH] registrationError:', err)
        })

        // Foreground toast + tap→deeplink listeners are attached
        // eagerly above by installDeeplinkListener(), before auth — so
        // a cold-start tap on Android OEMs that race the auth probe
        // doesn't lose the event. Don't re-attach here.
      } catch (err) {
        console.error('[PUSH] init failed:', err)
        registeredRef.current = false
      }
    }

    const attempt = async () => {
      if (registeredRef.current) return
      const signedIn = await isSignedIn()
      if (!signedIn) return
      registeredRef.current = true
      init()
    }

    // Returning users who are already signed in
    attempt()

    // New signups / fresh logins dispatch this event after OTP success
    const onAuth = () => { void attempt() }
    window.addEventListener('hai:auth-ready', onAuth)

    // Safety net: retry on focus in case the event was missed
    const onFocus = () => { void attempt() }
    window.addEventListener('focus', onFocus)

    return () => {
      window.removeEventListener('hai:auth-ready', onAuth)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return null
}

/**
 * Map a push payload to the in-app route that should open when the
 * user taps the notification. Priority of sources:
 *   1. data.deeplink — the `hai://…` scheme the server produced.
 *      Translated to the matching web path (e.g. `hai://rides/abc`
 *      → `/rides/abc`). This is the authoritative source when
 *      present.
 *   2. Type + id fields in the payload — fallback that handles
 *      older pushes that didn't include `data.deeplink`.
 *   3. `/feed` — last resort so the user never lands on a blank
 *      screen.
 */
function resolveDeeplink(data: Record<string, string>): string {
  const type = data.type || ''
  const deeplink = data.deeplink || ''

  // hai://<host><path>[?query]  →  /<host><path>[?query]
  // BUT: the server sometimes emits 'hai://post/<id>?comment=<id>'.
  // The app has no /post/[id] route (posts live inside /feed), so a
  // raw conversion would 404. Rewrite post paths to /feed with the
  // post/comment ids as query params.
  if (deeplink.startsWith('hai://')) {
    const rest = deeplink.slice('hai://'.length)
    if (rest.length > 0) {
      const [rawPath, rawQuery = ''] = rest.split('?', 2)
      const seg = rawPath.split('/').filter(Boolean)
      if (seg[0] === 'post' && seg[1]) {
        const q = new URLSearchParams(rawQuery)
        q.set('post', seg[1])
        return `/feed?${q.toString()}`
      }
      // Other host/path combos map 1:1 to web routes.
      return '/' + rest
    }
  }

  switch (type) {
    case 'comment_on_post':
    case 'reply_to_comment':
    case 'follow_post_comment':
      if (data.postId) {
        const c = data.commentId ? `?comment=${encodeURIComponent(data.commentId)}` : ''
        return `/feed?post=${encodeURIComponent(data.postId)}${c ? '&' + c.slice(1) : ''}`
      }
      return '/feed'

    case 'new_post':
    case 'reaction_on_post':
      if (data.postId) return `/feed?post=${encodeURIComponent(data.postId)}`
      return '/feed'

    case 'ride_status':
    case 'ride_offer':
    case 'ride_message':
    case 'ride_rating':
    case 'new_ride_request':
      if (data.rideRequestId) return `/rides/${encodeURIComponent(data.rideRequestId)}`
      return '/rides'

    case 'new_message':
      if (data.threadId) return `/threads/${encodeURIComponent(data.threadId)}`
      return '/threads'

    case 'emergency_alert_request':
      return '/mod?tab=emergency_requests'

    case 'user_report':
      return '/mod?tab=user_reports'

    case 'mod_request_submitted':
      return '/admin?tab=mod_requests'

    case 'mod_request_resolved':
      // The applicant lands on their profile, where the banner is
      // the source of truth and re-fetches on focus + push.
      return '/profile'

    case 'emergency_alert':
      return '/feed'

    case 'weekly_digest':
    default:
      return '/feed'
  }
}

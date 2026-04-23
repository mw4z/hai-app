'use client'

import { useEffect, useRef } from 'react'

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

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.Capacitor?.isNativePlatform()) return

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
            await PushNotifications.createChannel({
              id: 'emergency',
              name: 'Emergency Alerts',
              description: 'Urgent neighborhood alerts',
              importance: 5,
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

        // Foreground: log only — we don't want to double-notify on top of
        // the native banner. Server already queued the push.
        await PushNotifications.addListener(
          'pushNotificationReceived',
          (notification) => {
            console.log(
              '[PUSH] foreground received:',
              notification?.data?.type,
            )
          },
        )

        // Tap → deeplink navigation. Conservative: all types land in /feed.
        await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action) => {
            const data = (action?.notification?.data || {}) as Record<
              string,
              string
            >
            const target = resolveDeeplink(data.type)
            if (target) {
              try {
                window.location.href = target
              } catch {}
            }
          },
        )
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

function resolveDeeplink(type: string | undefined): string | null {
  switch (type) {
    case 'new_post':
    case 'comment_on_post':
    case 'reply_to_comment':
    case 'reaction_on_post':
    case 'emergency_alert':
    case 'weekly_digest':
      return '/feed'
    default:
      return '/feed'
  }
}

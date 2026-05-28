'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { showPushToast } from './PushToast'

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
  const router = useRouter()
  // Keep the latest router in a ref so the eager listener (which
  // installs once and lives for the page's lifetime) always calls
  // the current instance rather than capturing a stale closure.
  const routerRef = useRef(router)
  routerRef.current = router

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
    // ── Pending deeplink survival across reloads ────────────────────
    // Capacitor's plugin queues the launch action with
    // retainUntilConsumed:true — meaning it fires once, for the FIRST
    // listener that attaches, then drops the data. If that first
    // attach happens but the navigation fails (WKWebView race) OR if
    // SwUpdateReload triggers a service-worker handoff reload mid-
    // navigation, the event is consumed and gone. The reload lands
    // back on /feed with no way to recover the original target.
    //
    // Fix: persist the resolved target to sessionStorage the instant
    // we get the event. A mount-time effect (below) checks the same
    // key and continues the navigation across reloads. Cleared as
    // soon as the URL actually lands on the target.
    const PENDING_KEY = 'hai:pending-deeplink'

    // Helper: navigate to a target with the same two-layer strategy
    // (router.push first, fall back to window.location.assign with
    // retries). Kept inline so the launch handler AND the mount-time
    // resume effect both call the same code.
    // navigateToTarget v5 — router.push primary + anti-loop counter.
    //
    // v4 used window.location.assign to avoid the React-#419 rollback
    // flash, but that triggered a different bug: on cold-start when
    // the radio is still warming up, the assign() target page fails
    // to load → native fallback to bundled offline.html → offline.html
    // probes /api/ping → succeeds → reloads to bare REMOTE_URL → server
    // redirects bare URL to /feed → PushRegistration mounts → reads
    // PENDING_KEY → calls assign again → INFINITE LOOP through offline
    // page.
    //
    // Back to router.push (client-side, no network roundtrip for the
    // navigation itself, so no offline-page risk). Combined with the
    // anti-loop counter below: if we've tried more than MAX_NAV_ATTEMPTS
    // navigations within a cooldown window without holding the target,
    // give up and let the user stay where they are — better /feed
    // than a permanently broken loop.
    const NAV_ATTEMPT_KEY = 'hai:nav-attempts'
    const NAV_LAST_KEY = 'hai:nav-last-attempt-at'
    const MAX_NAV_ATTEMPTS = 3
    const NAV_COOLDOWN_MS = 8000

    const navigateToTarget = (target: string) => {
      try {
        const cur0 = window.location.pathname + window.location.search
        try {
          window.dispatchEvent(new CustomEvent('hai:deeplink-landed', { detail: target }))
        } catch {}
        try { sessionStorage.setItem('hai:deeplink-landed-at', String(Date.now())) } catch {}
        if (cur0 === target) return

        // Anti-loop: count attempts inside a sliding cooldown window.
        // If we've burned through MAX_NAV_ATTEMPTS without holding
        // target, give up — clear PENDING_KEY so the next mount
        // doesn't re-trigger this code path.
        let attempts = 0
        try {
          attempts = Number(sessionStorage.getItem(NAV_ATTEMPT_KEY) || '0')
          const lastAt = Number(sessionStorage.getItem(NAV_LAST_KEY) || '0')
          if (Date.now() - lastAt > NAV_COOLDOWN_MS) attempts = 0
        } catch {}
        if (attempts >= MAX_NAV_ATTEMPTS) {
          console.warn('[PUSH] anti-loop tripped — giving up after', attempts, 'attempts')
          try {
            sessionStorage.removeItem(PENDING_KEY)
            sessionStorage.removeItem(NAV_ATTEMPT_KEY)
            sessionStorage.removeItem(NAV_LAST_KEY)
          } catch {}
          return
        }
        try {
          sessionStorage.setItem(NAV_ATTEMPT_KEY, String(attempts + 1))
          sessionStorage.setItem(NAV_LAST_KEY, String(Date.now()))
        } catch {}

        console.log('[PUSH] navigateToTarget →', target, 'from', cur0, 'attempt', attempts + 1)
        try {
          routerRef.current.push(target)
        } catch (err) {
          console.error('[PUSH] router.push threw:', err)
        }
      } catch (err) {
        console.error('[PUSH] navigateToTarget failed:', err)
      }
    }

    // Check sessionStorage on every mount for a deeplink that didn't
    // finish navigating in a previous session (e.g. SwUpdateReload
    // killed the navigation). If present, resume immediately.
    try {
      const pending = sessionStorage.getItem(PENDING_KEY)
      if (pending) {
        console.log('[PUSH] resuming pending deeplink from sessionStorage:', pending)
        // Small delay so React/Capacitor have a tick to settle.
        setTimeout(() => navigateToTarget(pending), 50)
      }
    } catch {}

    // ── Deeplink stickiness watchdog ────────────────────────────────
    // Even after a successful navigation, something has been bouncing
    // the user back to /feed ~1s after the DM renders. Rather than
    // chase every possible culprit (server redirects, layout effects,
    // service-worker race), we install a brute-force watchdog: for 10
    // seconds after a deeplink lands, every 250ms we check the URL.
    // If it drifted off the target, we re-navigate. Cleared once the
    // window elapses or the user explicitly navigates somewhere we
    // recognise as intentional (back / forward / a different deep
    // path).
    let watchdogInterval: ReturnType<typeof setInterval> | null = null
    let watchdogTarget: string | null = null
    let watchdogDeadline = 0
    let watchdogDriftCount = 0
    const STICKINESS_MS = 15_000
    const startStickinessWatchdog = (target: string) => {
      if (watchdogTarget === target && watchdogInterval) return // idempotent
      watchdogTarget = target
      watchdogDeadline = Date.now() + STICKINESS_MS
      watchdogDriftCount = 0
      if (watchdogInterval) clearInterval(watchdogInterval)
      console.log('[PUSH] watchdog → guarding', target, 'for', STICKINESS_MS, 'ms')
      watchdogInterval = setInterval(() => {
        if (Date.now() > watchdogDeadline) {
          console.log('[PUSH] watchdog → window elapsed, releasing')
          if (watchdogInterval) clearInterval(watchdogInterval)
          watchdogInterval = null
          watchdogTarget = null
          // Now safe to clear the pending key — we held the URL as
          // long as we reasonably can. Also clear the anti-loop
          // counter so a future deeplink starts with a fresh budget.
          try {
            sessionStorage.removeItem(PENDING_KEY)
            sessionStorage.removeItem(NAV_ATTEMPT_KEY)
            sessionStorage.removeItem(NAV_LAST_KEY)
          } catch {}
          return
        }
        if (!watchdogTarget) return
        const cur = window.location.pathname + window.location.search
        if (cur === watchdogTarget) return
        watchdogDriftCount++
        console.warn('[PUSH] watchdog → drift #' + watchdogDriftCount + ' to', cur, '— forcing back to', watchdogTarget)
        // First two drifts: try router.push (cheap, client-side).
        // After that: escalate to window.location.assign which is a
        // full navigation that the server can't redirect away from
        // (Next.js root-page redirect only applies to bare `/`, not
        // /threads/<id>). assign also clears any pending router
        // transition that the bouncer might have hijacked.
        if (watchdogDriftCount <= 2) {
          try {
            routerRef.current.push(watchdogTarget)
          } catch (err) {
            console.error('[PUSH] watchdog router.push threw:', err)
          }
        } else {
          try {
            console.log('[PUSH] watchdog → escalating to assign()')
            window.location.assign(watchdogTarget)
          } catch (err) {
            console.error('[PUSH] watchdog assign threw:', err)
          }
        }
      }, 200)
    }
    // Hook the watchdog into the landing branch of navigateToTarget
    // by listening on a custom event the helper dispatches when it
    // confirms a successful land.
    const onDeeplinkLanded = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (typeof detail === 'string') startStickinessWatchdog(detail)
    }
    window.addEventListener('hai:deeplink-landed', onDeeplinkLanded)

    const installDeeplinkListener = async () => {
      if (deeplinkReadyRef.current) return
      deeplinkReadyRef.current = true
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications')

        await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          async (action) => {
            const data = (action?.notification?.data || {}) as Record<string, string>
            console.log('[PUSH] tap → resolving deeplink:', data?.type, data?.deeplink)

            // Broadcast open tracking (super-admin broadcast analytics) —
            // fire-and-forget, deduped per user server-side.
            if (data?.type === 'broadcast' && data?.broadcastId) {
              fetch(`/api/broadcast/${data.broadcastId}/click`, { method: 'POST', credentials: 'include' }).catch(() => {})
            }

            // Clear the tapped notification AND any siblings of the
            // same type from the system tray. Without this, an
            // already-read notification keeps sitting in the shade,
            // confusing the user into thinking there's still
            // something unseen. Works on both iOS (UNUserNotificationCenter)
            // and Android (NotificationManager) via the same plugin.
            try {
              const tapped = action?.notification
              const delivered = await PushNotifications.getDeliveredNotifications()
              const sameType = data?.type
              const toRemove = (delivered.notifications || []).filter((n) => {
                if (tapped?.id && n.id === tapped.id) return true
                // Also clear sibling pushes of the same type +
                // resource id (e.g. multiple comment notifications
                // for the same post / thread).
                const nd = (n.data || {}) as Record<string, string>
                if (!sameType || nd.type !== sameType) return false
                if (sameType === 'new_message' && data.threadId && nd.threadId === data.threadId) return true
                if ((sameType === 'comment_on_post' || sameType === 'reply_to_comment' || sameType === 'follow_post_comment') && data.postId && nd.postId === data.postId) return true
                if (sameType === 'new_ride_request' && data.rideRequestId && nd.rideRequestId === data.rideRequestId) return true
                return false
              })
              if (toRemove.length > 0) {
                await PushNotifications.removeDeliveredNotifications({ notifications: toRemove })
              }
            } catch (err) {
              console.error('[PUSH] clear-on-tap failed:', err)
            }

            const target = resolveDeeplink(data)
            if (!target) return
            // Persist the target IMMEDIATELY so a SwUpdateReload (or
            // any other reload that races our navigation) can resume
            // it on the next mount. Capacitor's plugin only replays
            // the event to the first listener — once we've received
            // it, the only place it can live is here in storage.
            try { sessionStorage.setItem(PENDING_KEY, target) } catch {}
            try {
              // Skip re-nav if we're already on the exact target — avoids
              // an unnecessary reload if the app was already on the page.
              const currentPath = window.location.pathname + window.location.search
              if (currentPath === target) {
                try {
            sessionStorage.removeItem(PENDING_KEY)
            // Mark that a deeplink just landed so SwUpdateReload
            // skips its auto-reload — see SwUpdateReload.tsx for why.
            sessionStorage.setItem('hai:deeplink-landed-at', String(Date.now()))
          } catch {}
          // Activate the stickiness watchdog on this target — if any
          // other code re-navigates to /feed within 10s, we'll catch
          // it and force a return here.
          try {
            window.dispatchEvent(new CustomEvent('hai:deeplink-landed', { detail: target }))
          } catch {}
                return
              }
              // Use the shared helper so the event handler AND the
              // mount-time resume both go through the same two-layer
              // (router.push → assign with retries) navigation logic.
              if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => navigateToTarget(target), { once: true })
              } else {
                navigateToTarget(target)
              }
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
            const data = (notification?.data || {}) as Record<string, string>
            const type = data.type
            console.log('[PUSH] foreground received:', type)

            // OS-level cleanup push (data-only). Server fires this when
            // a post / comment / thread / ride is deleted — we need to
            // remove the matching delivered notification from the OS
            // notification center without showing UI of our own.
            if (data.cleanup === 'true' && data.contentType && data.contentId) {
              void removeDeliveredByRef({
                contentType: data.contentType,
                contentId: data.contentId,
              })
              return
            }

            // Bridge push → DOM events FIRST so chat / list screens
            // refresh immediately even if the toast is suppressed.
            try {
              if (type === 'mod_request_resolved') {
                window.dispatchEvent(new CustomEvent('hai:mod-request-resolved', {
                  detail: data,
                }))
              } else if (type === 'new_message') {
                window.dispatchEvent(new CustomEvent('hai:new-message', {
                  detail: data,
                }))
              }
            } catch {}

            // Suppress the toast when the user is already on the
            // surface the notification points at — pointless to
            // notify someone about a DM in a thread they're staring
            // at. Same for post comment pushes when they're already
            // reading that post.
            try {
              const path = window.location.pathname
              const search = window.location.search
              if (type === 'new_message' && data.threadId
                  && path === `/threads/${data.threadId}`) {
                return
              }
              if ((type === 'comment_on_post' || type === 'reply_to_comment'
                   || type === 'follow_post_comment')
                  && data.postId
                  && path === '/feed' && search.includes(`post=${encodeURIComponent(data.postId)}`)) {
                return
              }
            } catch {}

            // Custom toast: replaces (not stacks) the previous one,
            // swipe-to-dismiss, taps deeplink. See PushToast.tsx.
            try {
              const title = notification?.title || (data as any)?.title || null
              const body = notification?.body || (data as any)?.body || null
              const target = resolveDeeplink(data)
              showPushToast({
                title,
                body,
                icon: type === 'new_message' ? '💬'
                  : type === 'emergency_alert' ? '🚨'
                  : '🔔',
                onTap: target ? () => {
                  try {
                    const cur = window.location.pathname + window.location.search
                    if (cur !== target) window.location.href = target
                  } catch {}
                } : undefined,
              })
            } catch (err) {
              console.error('[PUSH] foreground toast failed:', err)
            }
          },
        )
      } catch (err) {
        console.error('[PUSH] deeplink listener install failed:', err)
        deeplinkReadyRef.current = false
      }
    }
    installDeeplinkListener()

    // ── Targeted delivered-notification removal ──────────────────────
    // Called when we get a silent cleanup push (data.cleanup === 'true')
    // OR when the local app deletes content and dispatches
    // hai:content-deleted with a specific ref. Walks the OS-level
    // delivered notifications and removes the ones whose data field
    // matches `ref` (preferring contentType+contentId, falling back
    // to the legacy postId/commentId/threadId/rideRequestId fields
    // that older app builds may have shipped).
    const removeDeliveredByRef = async (ref: { contentType: string; contentId: string }) => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications')
        const delivered = await PushNotifications.getDeliveredNotifications()
        if (!delivered.notifications?.length) return
        const matches = delivered.notifications.filter((n) => {
          const d = (n.data || {}) as Record<string, string>
          if (d.contentType === ref.contentType && d.contentId === ref.contentId) return true
          if (ref.contentType === 'post'        && d.postId        === ref.contentId) return true
          if (ref.contentType === 'comment'     && d.commentId     === ref.contentId) return true
          if (ref.contentType === 'thread'      && d.threadId      === ref.contentId) return true
          if (ref.contentType === 'rideRequest' && d.rideRequestId === ref.contentId) return true
          return false
        })
        if (matches.length > 0) {
          await PushNotifications.removeDeliveredNotifications({ notifications: matches })
          console.log('[PUSH] removed', matches.length, 'delivered notifs for', ref.contentType, ref.contentId)
        }
      } catch (err) {
        console.error('[PUSH] removeDeliveredByRef failed:', err)
      }
    }

    // ── Stale tray sweep ─────────────────────────────────────────────
    // Server-side, when a post/comment/message/ride is removed (user
    // delete, mod action, report-threshold auto-remove), we delete
    // the corresponding Notification rows. But the OS tray (Android
    // notification shade / iOS notification center) keeps the banner
    // around until the user dismisses it manually. This sweep
    // reconciles: fetch the set of resource IDs the user STILL has
    // active notifications for, then remove tray entries whose
    // underlying ID isn't in that set.
    //
    // Runs on:
    //   - App foreground / first mount
    //   - Capacitor App.appStateChange isActive=true
    //   - Foreground delete via hai:content-deleted (covers the gap
    //     where appStateChange doesn't fire because the user never
    //     left the app)
    const sweepStaleTray = async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications')
        const delivered = await PushNotifications.getDeliveredNotifications()
        if (!delivered.notifications?.length) return
        const res = await fetch('/api/notifications/active-refs', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        })
        if (!res.ok) return // not signed in / network blip — silent
        const refs = await res.json() as {
          postIds: string[]
          commentIds: string[]
          threadIds: string[]
          rideRequestIds: string[]
        }
        const live = {
          posts: new Set(refs.postIds || []),
          comments: new Set(refs.commentIds || []),
          threads: new Set(refs.threadIds || []),
          rides: new Set(refs.rideRequestIds || []),
        }
        const stale = delivered.notifications.filter((n) => {
          const d = (n.data || {}) as Record<string, string>
          // Skip diagnostic test notifications (TEST_<ts> contentIds
          // never have a real Notification row, so the auto-sweep
          // would otherwise nuke them before the user can run the
          // next step in the revoke-notifications tester).
          if (d.contentId && d.contentId.startsWith('TEST_')) return false
          if (d.threadId && d.threadId.startsWith('TEST_')) return false
          if (d.threadId && !live.threads.has(d.threadId)) return true
          if (d.postId && !live.posts.has(d.postId)) return true
          if (d.commentId && !live.comments.has(d.commentId)) return true
          if (d.rideRequestId && !live.rides.has(d.rideRequestId)) return true
          return false
        })
        if (stale.length > 0) {
          await PushNotifications.removeDeliveredNotifications({ notifications: stale })
          console.log('[PUSH] tray sweep cleared', stale.length, 'stale notifications')
        }
      } catch (err) {
        console.error('[PUSH] tray sweep failed:', err)
      }
    }
    void sweepStaleTray()
    let appListenerHandle: { remove: () => void } | null = null
    ;(async () => {
      try {
        const { App } = await import('@capacitor/app')
        appListenerHandle = await App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
          if (isActive) void sweepStaleTray()
        })
      } catch { /* @capacitor/app not on web */ }
    })()
    // Re-sweep immediately whenever the user deletes content locally
    // (DM, post, comment) — the appStateChange path doesn't fire if
    // the app was already in foreground when the deletion happened,
    // so the tray banner sits stale until the next background/
    // foreground cycle. Listening for a custom event covers that gap.
    // Fired by ChatClient on message delete, PostCard on post/comment
    // delete, etc.
    // hai:content-deleted may carry a specific ref in event.detail —
    // if it does, we can target that one delivered notification
    // without the full active-refs roundtrip. Either way, fall back
    // to the full sweep so any related notifs (e.g. ride request
    // notifs after the ride was deleted) also get cleared.
    const onContentDeleted = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { contentType?: string; contentId?: string }
        | undefined
      if (detail?.contentType && detail?.contentId) {
        void removeDeliveredByRef({
          contentType: detail.contentType,
          contentId: detail.contentId,
        })
      }
      void sweepStaleTray()
    }
    window.addEventListener('hai:content-deleted', onContentDeleted)
    const cleanupAppListener = () => {
      try { appListenerHandle?.remove() } catch {}
      window.removeEventListener('hai:content-deleted', onContentDeleted)
      window.removeEventListener('hai:deeplink-landed', onDeeplinkLanded)
      if (watchdogInterval) {
        clearInterval(watchdogInterval)
        watchdogInterval = null
      }
    }

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

        // Contextual permission flow: do NOT open the OS prompt
        // on cold start. The user must first understand the app,
        // then opt in via NotificationPermissionNudge's primary
        // button (which calls PushNotifications.requestPermissions
        // itself and then re-fires the 'focus' event to drive this
        // path on the next cycle).
        //
        // checkPermissions() is a read-only probe — never raises a
        // dialog. We register only when permission is ALREADY
        // 'granted'. Any other state ('prompt', 'denied', 'prompt-
        // with-rationale') is left for the nudge to handle.
        const perm = await PushNotifications.checkPermissions()
        if (perm.receive !== 'granted') {
          console.log('[PUSH] permission not granted (contextual flow, not auto-prompting):', perm.receive)
          // Reset the registered flag so a later re-attempt (after
          // the user enables Notifications via the nudge → OS
          // prompt or via app settings) can re-run init when the
          // 'focus' event refires.
          registeredRef.current = false
          return
        }

        // CRITICAL ORDERING: attach the 'registration' listener BEFORE
        // calling register(). The plugin dispatches the token via that
        // event as soon as APNs replies — on fresh iOS reinstalls the
        // round-trip can be < 200ms, which is faster than the await
        // returns control. Listeners attached after register() were
        // missing the event entirely on reinstall, leaving the server
        // with the dead pre-uninstall token and dropping every push.
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
              // Custom Hai chime — file lives at
              // android/app/src/main/res/raw/hai_chime.wav. Android's
              // notification channel sound binds at channel-creation
              // time and CANNOT be changed afterward; deleting and
              // recreating the channel is the only way to swap. Old
              // installs that already created hai_default with the
              // default sound will keep the default until the user
              // reinstalls (Android limitation, not ours).
              sound: 'hai_chime',
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

        // Foreground toast + tap→deeplink listeners are attached
        // eagerly above by installDeeplinkListener(), before auth — so
        // a cold-start tap on Android OEMs that race the auth probe
        // doesn't lose the event. Registration + registrationError
        // listeners are attached at the top of init() (before
        // register()) to avoid the iOS reinstall race. Don't re-attach
        // here.
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

    // New signups / fresh logins dispatch this event after OTP success.
    // PROBLEM: on iOS Capacitor, the Set-Cookie response from
    // /api/auth/verify-otp isn't always available to the next fetch in
    // the same JS tick — the WKWebView cookie store hasn't committed
    // yet. attempt() would see isSignedIn() = false, bail, and the
    // user's reinstalled device never registered its new APNs token.
    // Retry up to 5× with 250ms backoff so we tolerate that race.
    const onAuth = async () => {
      for (let i = 0; i < 5; i++) {
        if (registeredRef.current) return
        const ok = await isSignedIn()
        if (ok) {
          registeredRef.current = true
          init()
          return
        }
        await new Promise((r) => setTimeout(r, 250))
      }
      console.warn('[PUSH] auth-ready: still not signed in after 5 retries — relying on focus retry')
    }
    window.addEventListener('hai:auth-ready', onAuth)

    // Safety net: retry on focus in case the event was missed
    const onFocus = () => { void attempt() }
    window.addEventListener('focus', onFocus)

    return () => {
      window.removeEventListener('hai:auth-ready', onAuth)
      window.removeEventListener('focus', onFocus)
      cleanupAppListener()
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

    case 'square_notify':
      // Defensive fallback — normally the `deeplink: 'hai://square'`
      // field on the payload takes precedence and lands the user on
      // /square via the generic hai:// → / mapping above. This case
      // catches the rare path where `deeplink` is dropped en-route.
      return '/square'

    case 'weekly_digest':
    default:
      return '/feed'
  }
}

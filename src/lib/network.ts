'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import React from 'react'

/**
 * Shared network-awareness layer for the WebView.
 *
 * The browser's navigator.onLine flag lies in two important cases:
 *  - iOS Safari / Capacitor WebView sometimes stays "online" while
 *    the radio is actually airplane'd.
 *  - Android WebViews on captive-portal wifi report "online" but
 *    every backend call fails.
 *
 * We treat navigator.onLine as a HINT, then verify reachability with
 * a tiny GET to /api/ping. The exposed status is one of:
 *
 *   'online'      navigator says online AND last ping succeeded
 *   'unstable'    navigator says online but last ping failed (or
 *                  is taking too long) — soft warning state
 *   'offline'     navigator says offline OR ping failed twice
 *
 * Components consume the status via useNetworkStatus(); the global
 * OfflineBanner mounts a single instance per app.
 */

export type NetStatus = 'online' | 'unstable' | 'offline'

interface NetworkContextValue {
  status: NetStatus
  isOnline: boolean        // shorthand: status === 'online'
  isOffline: boolean       // shorthand: status === 'offline'
  lastReconnectAt: number | null
  ping: () => Promise<boolean>
}

const NetworkContext = createContext<NetworkContextValue | null>(null)

const PING_URL = '/api/ping'
const PING_TIMEOUT_MS = 3500
const PING_INTERVAL_MS = 90_000          // periodic background check (was 25s — too aggressive)
const PING_FOCUS_DEBOUNCE_MS = 30_000    // ignore focus/visibility probes when one already ran recently
const COLD_START_GRACE_MS = 6000         // launch (esp. from a notification) radio warm-up
const COLD_START_RETRY_MS = 1000         // quick retry cadence while warming up

async function probe(): Promise<boolean> {
  if (typeof window === 'undefined') return true
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS)
  try {
    const res = await fetch(`${PING_URL}?_=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      signal: ctrl.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  // Initial state: assume online so we don't show a banner during the
  // first paint while the probe is running. If the device truly is
  // offline, the listener / first probe flips us to 'offline' fast.
  const [status, setStatus] = useState<NetStatus>('online')
  const [lastReconnectAt, setLastReconnectAt] = useState<number | null>(null)
  const failuresRef = useRef(0)
  const lastWasOfflineRef = useRef(false)
  // Last time we hit /api/ping. Used to debounce focus/visibilitychange
  // events that can fire many times per minute on mobile and were
  // hammering /api/ping enough to slow page navigation.
  const lastProbeAtRef = useRef(0)
  // On cold start (especially from a tapped notification) the network
  // stack isn't ready for the first couple seconds; until this timestamp
  // a failed probe stays optimistic + retries instead of flashing the
  // offline banner + a false "back online" toast.
  const coldStartUntilRef = useRef(Date.now() + COLD_START_GRACE_MS)

  const updateStatus = useCallback((next: NetStatus) => {
    setStatus((prev) => {
      if (prev === next) return prev
      // Flag a reconnect transition so OfflineBanner can show the
      // brief "Back online" toast — only when we were ACTUALLY off.
      if (next === 'online' && lastWasOfflineRef.current) {
        setLastReconnectAt(Date.now())
      }
      lastWasOfflineRef.current = next === 'offline'
      return next
    })
  }, [])

  // Re-arm the cold-start grace window. Called on EVERY resume (visibility,
  // focus, online, Capacitor appStateChange) — not just the initial mount —
  // because tapping a notification usually RESUMES the existing WebView
  // (NetworkProvider never re-mounts) and the radio warms up again. We
  // deliberately do NOT reset failuresRef here, so a genuine ongoing outage
  // stays 'offline' across a resume instead of flickering through 'unstable'.
  const beginGrace = useCallback(() => {
    coldStartUntilRef.current = Date.now() + COLD_START_GRACE_MS
  }, [])

  const runProbe = useCallback(async () => {
    lastProbeAtRef.current = Date.now()
    const ok = await probe()
    if (ok) {
      failuresRef.current = 0
      updateStatus('online')
      return true
    }
    // Cold-start / resume grace: during the warm-up window a failed probe
    // doesn't mean we're offline — the radio just isn't ready. Stay optimistic
    // and retry quickly instead of flashing "no internet" + a false "back
    // online" toast on launch/resume.
    if (Date.now() < coldStartUntilRef.current) {
      setTimeout(() => { void runProbe() }, COLD_START_RETRY_MS)
      return false
    }
    failuresRef.current += 1
    if (failuresRef.current >= 2) {
      updateStatus('offline')
    } else {
      // First failure outside the grace window → soft warning, and probe once
      // more shortly to CONFIRM a real outage (→ offline) vs. a one-off blip
      // (→ back online). This is what lets genuine offline resolve in ~1s
      // without ever trusting navigator.onLine's flaky launch/resume value.
      updateStatus('unstable')
      setTimeout(() => { void runProbe() }, COLD_START_RETRY_MS)
    }
    return false
  }, [updateStatus])

  const runProbeIfStale = useCallback(() => {
    if (Date.now() - lastProbeAtRef.current < PING_FOCUS_DEBOUNCE_MS) return
    void runProbe()
  }, [runProbe])

  useEffect(() => {
    // navigator.onLine is a flaky HINT (see the module docstring), and on
    // launch/resume it briefly reports false while the radio spins up — which
    // used to fire the `offline` event and flash the banner for ~2s before a
    // probe corrected it. So we NEVER flip to offline straight off the browser
    // `offline` event: we verify with a real probe (which honours the grace
    // window + the confirm-probe in runProbe). `online` re-arms a short grace
    // because a freshly-restored connection can still drop its first request.
    const onOnline = () => { beginGrace(); void runProbe() }
    const onOffline = () => { void runProbe() }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // Resume signals (background→foreground). Re-arm the grace window FIRST so
    // any `offline` event racing in during warm-up is treated optimistically,
    // then re-check. The probe stays debounced (30s) to avoid hammering
    // /api/ping on rapid focus/visibility churn (e.g. keyboard open/close).
    const onResume = () => {
      if (document.visibilityState !== 'visible') return
      beginGrace()
      runProbeIfStale()
    }
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('focus', onResume)

    // Capacitor: the most reliable foreground signal on native — fires when a
    // tapped notification resumes the app. This is the case the web events
    // miss, because the WebView is restored (NetworkProvider doesn't remount)
    // so the original grace window is long expired. An explicit probe here
    // bypasses the focus debounce since this is a genuine resume.
    let appListener: { remove: () => void } | null = null
    const isNative = typeof window !== 'undefined' &&
      !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
    if (isNative) {
      import('@capacitor/app')
        .then(({ App }) => App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
          if (!isActive) return
          beginGrace()
          void runProbe()
        }))
        .then((h) => { appListener = h })
        .catch(() => {})
    }

    // Initial check + slow background poll (90s).
    void runProbe()
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void runProbe()
    }, PING_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('focus', onResume)
      appListener?.remove()
      clearInterval(id)
    }
  }, [runProbe, runProbeIfStale, beginGrace])

  const value = useMemo<NetworkContextValue>(() => ({
    status,
    isOnline: status === 'online',
    isOffline: status === 'offline',
    lastReconnectAt,
    ping: runProbe,
  }), [status, lastReconnectAt, runProbe])

  return React.createElement(NetworkContext.Provider, { value }, children)
}

export function useNetworkStatus(): NetworkContextValue {
  const ctx = useContext(NetworkContext)
  if (!ctx) {
    // Safe fallback when used outside the provider (server-side render
    // path, isolated stories): always-online stub.
    return {
      status: 'online',
      isOnline: true,
      isOffline: false,
      lastReconnectAt: null,
      ping: async () => true,
    }
  }
  return ctx
}

// ────────────────────────────────────────────────────────────────────
// safeFetch — fetch wrapper with offline awareness + normalized errors
// ────────────────────────────────────────────────────────────────────

export class OfflineError extends Error {
  isOffline = true as const
  constructor(message = 'offline') {
    super(message)
    this.name = 'OfflineError'
  }
}

/**
 * Wrap any fetch call so a network failure always surfaces as an
 * OfflineError, never a raw TypeError. Use in new code; existing
 * call sites continue to work unchanged.
 *
 *   try {
 *     const res = await safeFetch('/api/posts', { method: 'POST', ... })
 *     ...
 *   } catch (err) {
 *     if (isOfflineError(err)) toast.error(t('offline_action_blocked'))
 *     else throw err
 *   } finally {
 *     setSubmitting(false)
 *   }
 */
export async function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new OfflineError('navigator_offline')
  }
  try {
    const res = await fetch(input, init)
    return res
  } catch (err) {
    // fetch only throws on network-level failures (DNS, refused,
    // aborted by user agent, CORS, etc.). Any HTTP status — even
    // 500 — resolves normally. Treat all of these as offline-class.
    if (err instanceof OfflineError) throw err
    throw new OfflineError(err instanceof Error ? err.message : 'fetch_failed')
  }
}

export function isOfflineError(err: unknown): err is OfflineError {
  return !!(err && typeof err === 'object' && (err as { isOffline?: boolean }).isOffline === true)
}

/**
 * Wrap an async user-action handler so that:
 *   - if offline, the handler is short-circuited with an offline toast
 *   - if it throws a network error, the toast fires and the original
 *     thrown error is swallowed (caller's UI doesn't crash)
 *   - the loading-state setter (if provided) ALWAYS runs in finally
 *
 * Safe to use anywhere a button kicks off a network request:
 *
 *   onClick={withNetGuard(async () => {
 *     const res = await safeFetch('/api/foo', { method: 'POST' })
 *     ...
 *   }, {
 *     status,                 // from useNetworkStatus()
 *     setLoading,             // from useState
 *     onOffline: () => toast.error(t('offline_action_blocked')),
 *   })}
 */
export function withNetGuard<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<unknown>,
  opts: {
    status: NetStatus
    setLoading?: (v: boolean) => void
    onOffline?: () => void
    onError?: (err: unknown) => void
  },
) {
  return async (...args: TArgs) => {
    if (opts.status === 'offline') {
      opts.onOffline?.()
      return
    }
    opts.setLoading?.(true)
    try {
      await fn(...args)
    } catch (err) {
      if (isOfflineError(err)) {
        opts.onOffline?.()
      } else {
        opts.onError?.(err)
      }
    } finally {
      opts.setLoading?.(false)
    }
  }
}

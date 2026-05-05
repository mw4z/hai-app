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

  const runProbe = useCallback(async () => {
    lastProbeAtRef.current = Date.now()
    const ok = await probe()
    if (ok) {
      failuresRef.current = 0
      updateStatus('online')
      return true
    }
    failuresRef.current += 1
    // One failure → unstable (soft warning). Two consecutive → offline.
    updateStatus(failuresRef.current >= 2 ? 'offline' : 'unstable')
    return false
  }, [updateStatus])

  const runProbeIfStale = useCallback(() => {
    if (Date.now() - lastProbeAtRef.current < PING_FOCUS_DEBOUNCE_MS) return
    void runProbe()
  }, [runProbe])

  useEffect(() => {
    // Cold-start grace period. On iOS especially when the app is
    // launched from a tapped notification, the radio is still spinning
    // up and `navigator.onLine` briefly reports false — which fires
    // the `offline` event, flips status to 'offline', and shows the
    // banner for ~2 seconds before the next probe corrects it. The
    // grace window short-circuits that: for the first 3 seconds, an
    // `offline` browser event triggers a probe instead of an instant
    // status flip, so we only believe we're offline when an actual
    // network call fails.
    const mountedAt = Date.now()
    const COLD_START_GRACE_MS = 3000

    const onOnline = () => { void runProbe() }
    const onOffline = () => {
      if (Date.now() - mountedAt < COLD_START_GRACE_MS) {
        // Don't trust the navigator yet; verify with a real probe.
        // If the radio actually IS down, the probe will fail and the
        // failure counter logic below promotes us to offline normally.
        void runProbe()
        return
      }
      failuresRef.current = 2
      updateStatus('offline')
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // Re-probe on focus/visibilitychange, but ONLY if we haven't
    // probed recently. Without the debounce, every navigation +
    // every WebView resume hit /api/ping, and on Vercel cold-start
    // those probes piled up enough latency to slow real page
    // navigation. 30s debounce window — plenty for real connectivity
    // changes, cheap for normal use.
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      runProbeIfStale()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)

    // Initial check + slow background poll. Bumped from 25s → 90s.
    void runProbe()
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void runProbe()
    }, PING_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
      clearInterval(id)
    }
  }, [runProbe, runProbeIfStale, updateStatus])

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

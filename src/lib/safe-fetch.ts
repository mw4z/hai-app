// ─── Safe Fetch Utilities ───────────────────────────────────────────────────
// Frontend-safe API calls with error handling, deduplication, and debounce.

/**
 * Fetch wrapper that never throws — returns { data, error } instead.
 * Handles network errors, JSON parse failures, and API error responses.
 */
export async function safeFetch<T = any>(
  url: string,
  options?: RequestInit,
): Promise<{ data: T | null; error: string | null; status: number }> {
  try {
    const res = await fetch(url, options)
    const status = res.status

    // Handle non-JSON responses (e.g., HTML error pages)
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      if (!res.ok) {
        return { data: null, error: `Server error (${status})`, status }
      }
      return { data: null, error: 'Unexpected response format', status }
    }

    const data = await res.json()

    if (!res.ok) {
      // Extract error message from various API response formats
      const msg =
        data?.error?.message ||
        (typeof data?.error === 'string' ? data.error : null) ||
        data?.message ||
        `Error (${status})`
      return { data: null, error: msg, status }
    }

    return { data, error: null, status }
  } catch (err) {
    // Network error, timeout, etc.
    const isOffline = !navigator.onLine
    return {
      data: null,
      error: isOffline ? 'لا يوجد اتصال / No connection' : 'تعذر الاتصال / Connection failed',
      status: 0,
    }
  }
}

// ─── Action Guard (debounce + dedup) ────────────────────────────────────────

const pendingActions = new Set<string>()

/**
 * Prevents double-submission of critical actions.
 * Returns false if the action is already in progress.
 *
 * Usage:
 *   if (!guardAction('select-offer-123')) return
 *   try { await doWork() } finally { releaseAction('select-offer-123') }
 */
export function guardAction(key: string): boolean {
  if (pendingActions.has(key)) return false
  pendingActions.add(key)
  return true
}

export function releaseAction(key: string) {
  pendingActions.delete(key)
}

// ─── Simple Debounce ────────────────────────────────────────────────────────

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Debounce a function call by key. Only the last call within `ms` executes.
 */
export function debounce(key: string, fn: () => void, ms: number = 300) {
  const existing = debounceTimers.get(key)
  if (existing) clearTimeout(existing)
  debounceTimers.set(key, setTimeout(() => {
    debounceTimers.delete(key)
    fn()
  }, ms))
}

/**
 * kickNotifCron() — fire-and-forget trigger that hits
 * /api/cron/process-notifs right after an event enqueues a NotifJob.
 *
 * Vercel's built-in cron runs at most every minute, so without this
 * kick a comment / reply / reaction can sit up to ~60 seconds in the
 * queue before the push is actually sent. This function calls the
 * cron URL out-of-band so the new job is drained within 1–2 seconds.
 *
 * Guarantees:
 *   • Non-blocking — we `void` the promise and swallow all errors.
 *   • Rate-limited — self-calls are coalesced to at most once every
 *     few seconds so a burst of 20 reactions doesn't fan out to 20
 *     cron invocations (the cron itself drains the whole queue per
 *     call anyway, so only one wake-up is needed).
 *   • Auth via Bearer CRON_SECRET. If the secret isn't set the kick
 *     silently 401s — delivery still happens on the next minute-mark
 *     Vercel cron, same as before.
 */

// Short cooldown so bursts coalesce, but with a trailing edge:
// events that arrive during the cooldown don't get dropped — they
// schedule a delayed kick at the end of the window. Previously a
// burst of ride events (driver selected → confirmed → en-route →
// arrived) could leave most jobs waiting for the minute-mark cron
// because only the first kick fired.
const MIN_KICK_INTERVAL_MS = 1500
let lastKickAt = 0
let pendingTimer: ReturnType<typeof setTimeout> | null = null

function fireKick(): void {
  const secret = process.env.CRON_SECRET
  if (!secret) return
  const base =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || 'https://app.hai-app.net'
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 3000)
  void fetch(`${base}/api/cron/process-notifs`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
    signal: ctrl.signal,
    cache: 'no-store',
  })
    .catch(() => { /* ignore — fallback is the minute-mark cron */ })
    .finally(() => clearTimeout(timeout))
}

export function kickNotifCron(): void {
  const now = Date.now()
  const sinceLast = now - lastKickAt

  if (sinceLast >= MIN_KICK_INTERVAL_MS) {
    // Outside cooldown — kick immediately.
    lastKickAt = now
    fireKick()
    return
  }

  // Inside cooldown — already a trailing kick scheduled? Skip.
  if (pendingTimer) return

  // Schedule a trailing kick so the event we just received is still
  // picked up within ~MIN_KICK_INTERVAL_MS, not 60s.
  const wait = MIN_KICK_INTERVAL_MS - sinceLast
  pendingTimer = setTimeout(() => {
    pendingTimer = null
    lastKickAt = Date.now()
    fireKick()
  }, wait)
}

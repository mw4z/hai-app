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

const MIN_KICK_INTERVAL_MS = 3000
let lastKickAt = 0

export function kickNotifCron(): void {
  const now = Date.now()
  if (now - lastKickAt < MIN_KICK_INTERVAL_MS) return
  lastKickAt = now

  const secret = process.env.CRON_SECRET
  if (!secret) return

  // Absolute URL for the cron endpoint. Vercel exposes VERCEL_URL
  // at runtime ; fall back to NEXT_PUBLIC_APP_URL or the public
  // production host.
  const base =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL
      || 'https://app.hai-app.net'

  // Fire-and-forget. Don't await — we don't block the request that
  // just enqueued the job. 3s timeout is a hard cap in case Vercel
  // is slow; the cron itself runs with its own 60s allowance.
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

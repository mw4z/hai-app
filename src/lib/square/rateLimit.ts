/**
 * Square rate limits — minimal but real, on from day one (even while
 * the feature is admin-only). Anti-spam protections need to be in the
 * implementation pattern BEFORE the surface opens to all users.
 *
 *   - 3 threads / 24h for new (<7 days old account) OR low-reputation
 *     authors. Established users with positive reputation are exempt.
 *   - Reply rate: ≥ 5 seconds between replies from the same user
 *     (across all threads — this is a "don't hammer reply" guard, not
 *     a per-thread quota).
 *
 * SUPER_ADMIN bypasses both (see [[isSuperAdmin]] — same pattern used
 * in /api/posts).
 */

import { db } from '@/lib/db'

export const SQUARE_NEW_USER_DAILY_THREAD_LIMIT = 3
/** Reputation at/above which a user is treated as "established" and
 *  bypasses the new-user daily thread quota. Mirrors the rep gate used
 *  by other post-quota helpers (5 is the smallest positive threshold
 *  in [[lib/reputation]] that meaningfully filters new accounts). */
export const SQUARE_ESTABLISHED_REP_FLOOR = 5
const ACCOUNT_AGE_NEW_USER_MS = 7 * 24 * 60 * 60 * 1000
const REPLY_COOLDOWN_MS = 5 * 1000

export interface RateLimitFailure {
  ok: false
  code: 'thread_daily_limit' | 'reply_cooldown'
  /** Pre-translated Arabic copy ready to render. */
  messageAr: string
}
export type RateLimitResult = { ok: true } | RateLimitFailure

/** Is this user inside the "new + low rep" cohort that gets the daily
 *  thread quota? Established residents and admins skip the check at
 *  the call site. */
function isQuotedAuthor(user: { createdAt: Date; reputation: number }): boolean {
  const ageMs = Date.now() - user.createdAt.getTime()
  if (ageMs < ACCOUNT_AGE_NEW_USER_MS) return true
  if (user.reputation < SQUARE_ESTABLISHED_REP_FLOOR) return true
  return false
}

/** Run before INSERT on SquareThread. SUPER_ADMIN should be checked
 *  by the caller and skip this entirely. */
export async function checkSquareThreadRateLimit(user: {
  id: string
  createdAt: Date
  reputation: number
}): Promise<RateLimitResult> {
  if (!isQuotedAuthor(user)) return { ok: true }
  const dayStart = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const created = await db.squareThread.count({
    where: {
      authorId: user.id,
      createdAt: { gte: dayStart },
    },
  })
  if (created >= SQUARE_NEW_USER_DAILY_THREAD_LIMIT) {
    return {
      ok: false,
      code: 'thread_daily_limit',
      messageAr:
        'تجاوزت الحد اليومي للنقاشات الجديدة في الساحة. حاول لاحقًا أو شارك في النقاشات الموجودة.',
    }
  }
  return { ok: true }
}

/** Run before INSERT on SquareReply. Simple "don't spam reply" guard. */
export async function checkSquareReplyRateLimit(userId: string): Promise<RateLimitResult> {
  const since = new Date(Date.now() - REPLY_COOLDOWN_MS)
  const recent = await db.squareReply.findFirst({
    where: { authorId: userId, createdAt: { gte: since } },
    select: { id: true },
  })
  if (recent) {
    return {
      ok: false,
      code: 'reply_cooldown',
      messageAr: 'انتظر لحظة بين الردود.',
    }
  }
  return { ok: true }
}

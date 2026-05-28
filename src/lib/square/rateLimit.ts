/**
 * Square rate limits — minimal but real, on from day one (even while
 * the feature is admin-only). Anti-spam protections need to be in the
 * implementation pattern BEFORE the surface opens to all users.
 *
 *   - 3 messages / 24h for new (<7 days old account) OR low-reputation
 *     authors. Established users with positive reputation are exempt.
 *   - Send rate: ≥ 5 seconds between consecutive messages from the
 *     same user (across all neighborhoods — guards "spam-rapid-send"
 *     of identical or near-identical content).
 *
 * SUPER_ADMIN bypasses both (see [[isSuperAdmin]] — same pattern used
 * in /api/posts).
 */

import { db } from '@/lib/db'

export const SQUARE_NEW_USER_DAILY_MESSAGE_LIMIT = 3
/** Reputation at/above which a user is treated as "established" and
 *  bypasses the new-user daily message quota. Mirrors the rep gate
 *  used by other post-quota helpers (5 is the smallest positive
 *  threshold in [[lib/reputation]] that meaningfully filters new
 *  accounts). */
export const SQUARE_ESTABLISHED_REP_FLOOR = 5
const ACCOUNT_AGE_NEW_USER_MS = 7 * 24 * 60 * 60 * 1000
const SEND_COOLDOWN_MS = 5 * 1000

export interface RateLimitFailure {
  ok: false
  code: 'message_daily_limit' | 'send_cooldown'
  /** Pre-translated Arabic copy ready to render. */
  messageAr: string
}
export type RateLimitResult = { ok: true } | RateLimitFailure

function isQuotedAuthor(user: { createdAt: Date; reputation: number }): boolean {
  const ageMs = Date.now() - user.createdAt.getTime()
  if (ageMs < ACCOUNT_AGE_NEW_USER_MS) return true
  if (user.reputation < SQUARE_ESTABLISHED_REP_FLOOR) return true
  return false
}

/**
 * Combined check: daily quota AND send-cooldown, in that order so the
 * user sees the more meaningful failure first. SUPER_ADMIN should be
 * checked by the caller and skip this entirely.
 */
export async function checkSquareMessageRateLimit(user: {
  id: string
  createdAt: Date
  reputation: number
}): Promise<RateLimitResult> {
  // 1) Cooldown — cheap query, run first so a spamming user gets the
  //    quick "wait a moment" feedback instead of the daily-cap message.
  const since = new Date(Date.now() - SEND_COOLDOWN_MS)
  const recent = await db.squareMessage.findFirst({
    where: { authorId: user.id, createdAt: { gte: since } },
    select: { id: true },
  })
  if (recent) {
    return {
      ok: false,
      code: 'send_cooldown',
      messageAr: 'انتظر لحظة بين الرسائل.',
    }
  }

  // 2) Daily quota — only billed against new / low-rep accounts.
  if (isQuotedAuthor(user)) {
    const dayStart = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const count = await db.squareMessage.count({
      where: { authorId: user.id, createdAt: { gte: dayStart } },
    })
    if (count >= SQUARE_NEW_USER_DAILY_MESSAGE_LIMIT) {
      return {
        ok: false,
        code: 'message_daily_limit',
        messageAr:
          'تجاوزت الحد اليومي للرسائل في الساحة. حاول لاحقًا أو شارك بدلاً من ذلك بقراءة المنشورات.',
      }
    }
  }
  return { ok: true }
}

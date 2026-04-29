/**
 * canSendNotification(user, post, channel) — single gate every push /
 * in-app delivery must pass through.
 *
 * Rule order:
 *   1. CRITICAL priority bypasses all category filters (only the
 *      "kill switch" master toggle blocks it).
 *   2. Recipient must be in the same neighborhood as the post.
 *   3. Audience must match (a WOMEN-only post can't notify male users).
 *   4. Per-category channel preference (push vs in-app) must be on.
 *   5. LOW priority is suppressed for push, allowed for in-app only.
 */

import type {
  PostAudience,
  PostCategory,
  PostPriority,
} from '@prisma/client'
import { getPreferencesMap } from './preferences'

export type NotificationChannel = 'push' | 'inApp'

interface MinimalPost {
  category: PostCategory
  priority: PostPriority
  audience: PostAudience
  neighborhoodId: string
  authorId: string
  id?: string
}

interface MinimalUser {
  id: string
  neighborhoodId: string | null
  gender: 'MALE' | 'FEMALE' | 'UNSPECIFIED' | null
  /** master kill-switch — if false, suppress everything except CRITICAL. */
  notificationsEnabled?: boolean
}

export async function canSendNotification(
  user: MinimalUser,
  post: MinimalPost,
  channel: NotificationChannel,
): Promise<boolean> {
  // Never notify the author about their own post.
  if (user.id === post.authorId) return false

  const isCritical = post.priority === 'CRITICAL'

  // Master kill-switch. CRITICAL still goes through unless the user
  // explicitly opts out in advanced settings (a future "disable
  // critical" flag would be added here).
  if (user.notificationsEnabled === false && !isCritical) return false

  // Same-neighborhood gate. The seed posts span multiple neighborhoods
  // so don't lean on this for emergency broadcasting — those use a
  // separate channel.
  if (!isCritical && user.neighborhoodId !== post.neighborhoodId) return false

  // Audience gate. WOMEN-targeted posts only reach female recipients,
  // MEN-targeted only reach male. ALL is unrestricted.
  if (post.audience === 'WOMEN' && user.gender !== 'FEMALE') return false
  if (post.audience === 'MEN'   && user.gender !== 'MALE')   return false

  // CRITICAL bypasses category & per-channel prefs entirely.
  if (isCritical) return true

  // LOW is in-app only — never pushes a banner.
  if (post.priority === 'LOW' && channel === 'push') return false

  const prefs = await getPreferencesMap(user.id)
  const pref = prefs.get(post.category)
  if (!pref) return true // shouldn't happen — preferences map fills defaults
  return channel === 'push' ? pref.pushEnabled : pref.inAppEnabled
}

/**
 * Bulk version: given a post, return the user IDs that should receive
 * a notification on the given channel. Ignores the author. Used by the
 * cron processor when fanning out a new-post / new-report notification.
 */
export async function getEligibleRecipients(
  post: MinimalPost,
  channel: NotificationChannel,
  candidateUsers: MinimalUser[],
): Promise<string[]> {
  const out: string[] = []
  for (const u of candidateUsers) {
    if (await canSendNotification(u, post, channel)) out.push(u.id)
  }
  return out
}

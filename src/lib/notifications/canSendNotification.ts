/**
 * canSendNotification — single gate every push / in-app delivery passes
 * through. Phase 1 of the preset redesign.
 *
 * Order of evaluation (top wins):
 *   1. Author exclusion
 *   2. Master kill (notificationsEnabled = false → no push, no exception)
 *   3. Same-neighborhood gate
 *   4. Audience match
 *   5. LOW priority is in-app only
 *   6. CRITICAL bypasses category prefs + quiet hours
 *   7. Category preference (with PRESET_PUSH fallback) + intent override
 *   8. In-app channel: skip quiet-hours check
 *   9. Quiet hours — only HIGH priority for URGENT_ONLY users punches through
 */

import type {
  NotificationPreference,
  NotificationPreset,
  PostAudience,
  PostCategory,
  PostIntent,
  PostPriority,
} from '@prisma/client'
import { getPreferencesMap, getPreferencesMapBulk } from './preferences'
import { PRESET_PUSH, URGENT_REQUEST_CATEGORIES } from './presets'

export type NotificationChannel = 'push' | 'inApp'
export type UserPrefMap = Map<PostCategory, NotificationPreference>

interface MinimalPost {
  id?: string
  category: PostCategory
  intent: PostIntent
  priority: PostPriority
  audience: PostAudience
  neighborhoodId: string
  authorId: string
}

interface MinimalUser {
  id: string
  neighborhoodId: string | null
  gender: 'MALE' | 'FEMALE' | 'UNSPECIFIED' | null
  /** Master kill — when false, no push at all (CRITICAL included). */
  notificationsEnabled?: boolean
  notificationPreset: NotificationPreset
  quietHoursEnabled: boolean
  quietHoursStart: number
  quietHoursEnd: number
  timezone: string
}

const EMPTY_PREFS: UserPrefMap = new Map()

/* ── Helpers ────────────────────────────────────────────────────────── */

function audienceMatches(post: MinimalPost, user: MinimalUser): boolean {
  if (post.audience === 'WOMEN') return user.gender === 'FEMALE'
  if (post.audience === 'MEN')   return user.gender === 'MALE'
  return true
}

/**
 * Resolve effective category-allowed:
 *   1) Stored row wins.
 *   2) Missing row + non-MANUAL preset → preset definition.
 *   3) Missing row + MANUAL → default ON. (API guarantees MANUAL users
 *      always have rows, so this is a fail-safe, not a usual path.)
 */
function categoryAllowed(
  user: MinimalUser,
  category: PostCategory,
  prefs: UserPrefMap,
): boolean {
  const row = prefs.get(category)
  if (row) return row.pushEnabled
  if (user.notificationPreset !== 'MANUAL') {
    return PRESET_PUSH[user.notificationPreset][category]
  }
  return true
}

/**
 * REQUEST + priority=HIGH bypass for URGENT_ONLY users on a tight
 * category whitelist. CRITICAL is short-circuited earlier so it never
 * reaches here. Anything else fails closed.
 */
function intentOverride(user: MinimalUser, post: MinimalPost): boolean {
  if (post.intent !== 'REQUEST') return false
  if (post.priority !== 'HIGH') return false
  if (user.notificationPreset !== 'URGENT_ONLY') return false
  return URGENT_REQUEST_CATEGORIES.has(post.category)
}

/**
 * Per-timezone formatter cache. `Intl.DateTimeFormat` allocation is
 * the hot-path cost; sharing one instance per IANA tz collapses a
 * fanout to a single formatter for the typical-case (all KSA users).
 */
const tzCache = new Map<string, Intl.DateTimeFormat>()
function fmtFor(tz: string): Intl.DateTimeFormat {
  let f = tzCache.get(tz)
  if (f) return f
  try {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    // Invalid IANA tz — fall back to KSA local.
    const fallback = tzCache.get('Asia/Riyadh')
    if (fallback) {
      tzCache.set(tz, fallback)
      return fallback
    }
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Riyadh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    tzCache.set('Asia/Riyadh', f)
    tzCache.set(tz, f)
    return f
  }
  tzCache.set(tz, f)
  return f
}

function localMinutesOfDay(date: Date, timezone: string): number {
  const parts = fmtFor(timezone).formatToParts(date)
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

export function isInQuietHours(
  user: Pick<MinimalUser, 'quietHoursStart' | 'quietHoursEnd' | 'timezone'>,
  now: Date,
): boolean {
  const minutes = localMinutesOfDay(now, user.timezone)
  const { quietHoursStart: start, quietHoursEnd: end } = user
  if (start === end) return false                      // zero-width = disabled
  if (start < end)   return minutes >= start && minutes < end
  return minutes >= start || minutes < end             // cross-midnight
}

/* ── Core gate ──────────────────────────────────────────────────────── */

/**
 * Synchronous gate. Caller MUST pass the user's preloaded preference
 * map (from getPreferencesMapBulk). Use this in fanouts.
 */
export function canSendNotificationSync(
  user: MinimalUser,
  post: MinimalPost,
  channel: NotificationChannel,
  prefs: UserPrefMap,
  now: Date = new Date(),
): boolean {
  if (user.id === post.authorId) return false
  if (user.notificationsEnabled === false) return false
  if (user.neighborhoodId !== post.neighborhoodId) return false
  if (!audienceMatches(post, user)) return false
  if (post.priority === 'LOW' && channel === 'push') return false
  if (post.priority === 'CRITICAL') return true

  const allowed = categoryAllowed(user, post.category, prefs) || intentOverride(user, post)
  if (!allowed) return false
  if (channel !== 'push') return true

  if (user.quietHoursEnabled && isInQuietHours(user, now)) {
    if (post.priority === 'HIGH' && user.notificationPreset === 'URGENT_ONLY') {
      return true
    }
    return false
  }
  return true
}

/**
 * Single-user wrapper — issues one DB query for prefs. DO NOT use inside
 * a recipient loop; use canSendNotificationSync + getPreferencesMapBulk
 * for fanouts. Kept for legacy single-call sites only.
 */
export async function canSendNotification(
  user: MinimalUser,
  post: MinimalPost,
  channel: NotificationChannel,
): Promise<boolean> {
  const prefs = await getPreferencesMap(user.id)
  return canSendNotificationSync(user, post, channel, prefs)
}

/**
 * Bulk fanout entry — ONE prefs query for all candidates, then runs the
 * sync gate per user. O(1) DB roundtrips regardless of N.
 */
export async function getEligibleRecipients(
  post: MinimalPost,
  channel: NotificationChannel,
  candidateUsers: MinimalUser[],
): Promise<string[]> {
  if (candidateUsers.length === 0) return []
  const prefsByUser = await getPreferencesMapBulk(candidateUsers.map(u => u.id))
  const now = new Date()
  const out: string[] = []
  for (const u of candidateUsers) {
    const prefs = prefsByUser.get(u.id) ?? EMPTY_PREFS
    if (canSendNotificationSync(u, post, channel, prefs, now)) {
      out.push(u.id)
    }
  }
  return out
}

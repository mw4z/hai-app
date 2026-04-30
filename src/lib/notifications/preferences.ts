/**
 * NotificationPreference helpers.
 *
 * Storage model: one row per (userId, category). Missing rows = use
 * defaults. New users get all categories ON. CRITICAL-priority posts
 * bypass per-category preferences entirely (handled in
 * canSendNotification, not here).
 */

import { db } from '@/lib/db'
import type {
  NotificationPreference,
  PostCategory,
  Prisma,
} from '@prisma/client'
import { ALL_CATEGORIES } from './presets'

/**
 * Idempotent: creates the missing rows for this user with the default
 * (push=true, in-app=true). Existing rows are not touched. Returns the
 * full preference set after the upsert.
 */
export async function createDefaultPreferences(userId: string): Promise<NotificationPreference[]> {
  const data: Prisma.NotificationPreferenceCreateManyInput[] = ALL_CATEGORIES.map((category) => ({
    userId,
    category,
    pushEnabled: true,
    inAppEnabled: true,
  }))

  await db.notificationPreference.createMany({
    data,
    skipDuplicates: true,
  })

  return db.notificationPreference.findMany({
    where: { userId },
    orderBy: { category: 'asc' },
  })
}

/**
 * Read-with-defaults — returns a Map<category, preference>. Categories
 * the user has never explicitly set come back as default rows (NOT
 * persisted; they only persist on first PATCH).
 *
 * For fanouts use getPreferencesMapBulk — this issues one query per call.
 */
export async function getPreferencesMap(userId: string): Promise<Map<PostCategory, NotificationPreference>> {
  const stored = await db.notificationPreference.findMany({ where: { userId } })
  const map = new Map<PostCategory, NotificationPreference>()
  for (const row of stored) map.set(row.category, row)
  for (const cat of ALL_CATEGORIES) {
    if (map.has(cat)) continue
    map.set(cat, {
      id: `__default__:${cat}`,
      userId,
      category: cat,
      pushEnabled: true,
      inAppEnabled: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    })
  }
  return map
}

/**
 * Bulk variant for fanouts. Issues a SINGLE query for every requested
 * userId and returns Map<userId, Map<category, preference>>. Inner
 * maps are sparse — missing categories must be resolved by the caller
 * via PRESET_PUSH (see canSendNotification.categoryAllowed).
 *
 * Collapsing the per-user N+1 was the dominant cost on every push
 * fanout; this is the launch-blocking perf change.
 */
export async function getPreferencesMapBulk(
  userIds: string[],
): Promise<Map<string, Map<PostCategory, NotificationPreference>>> {
  const out = new Map<string, Map<PostCategory, NotificationPreference>>()
  if (userIds.length === 0) return out
  const rows = await db.notificationPreference.findMany({
    where: { userId: { in: userIds } },
  })
  for (const id of userIds) out.set(id, new Map())
  for (const row of rows) {
    const inner = out.get(row.userId)
    if (inner) inner.set(row.category, row)
  }
  return out
}

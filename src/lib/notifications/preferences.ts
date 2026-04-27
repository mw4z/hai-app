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
  PostCategoryV2,
  Prisma,
} from '@prisma/client'

const ALL_CATEGORIES: PostCategoryV2[] = [
  'HOME_BUSINESSES',
  'MARKETPLACE',
  'SERVICES',
  'RIDES',
  'REAL_ESTATE',
  'LOST_FOUND',
  'NEIGHBORHOOD_REPORTS',
  'EVENTS',
  'COMPETITIONS',
  'GENERAL',
]

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
 */
export async function getPreferencesMap(userId: string): Promise<Map<PostCategoryV2, NotificationPreference>> {
  const stored = await db.notificationPreference.findMany({ where: { userId } })
  const map = new Map<PostCategoryV2, NotificationPreference>()
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

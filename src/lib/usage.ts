import { db } from '@/lib/db'
import { getLimits } from '@/lib/capabilities'
import type { PlanLimits } from '@/lib/capabilities'

/**
 * Centralized usage tracking.
 *
 * Instead of scattered count queries across API routes,
 * all usage checks go through this module.
 *
 * Usage counters reset daily (windowStart = midnight).
 * For non-daily limits (e.g. catalogItems), windowStart is epoch 0 (permanent).
 */

// Features with daily reset windows
const DAILY_FEATURES = new Set(['posts', 'rideOffers', 'threads', 'uploads'])

// Map feature names to capability keys
const FEATURE_TO_LIMIT: Record<string, keyof PlanLimits> = {
  posts: 'postsPerDay',
  rideOffers: 'rideOffersPerDay',
  threads: 'threadsPerDay',
  uploads: 'uploadsPerDay',
  catalogItems: 'catalogItems',
}

function getWindowStart(feature: string): Date {
  if (DAILY_FEATURES.has(feature)) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }
  // Permanent window for non-daily features
  return new Date(0)
}

/** Get current usage count for a feature */
export async function getUsage(userId: string, feature: string): Promise<number> {
  const windowStart = getWindowStart(feature)

  // For permanent features, count directly from the source table
  if (!DAILY_FEATURES.has(feature)) {
    if (feature === 'catalogItems') {
      return db.serviceItem.count({ where: { userId } })
    }
    // Fallback to counter
  }

  const counter = await db.usageCounter.findUnique({
    where: { userId_feature_windowStart: { userId, feature, windowStart } },
  })

  return counter?.count || 0
}

/** Increment usage counter. Returns the new count. */
export async function incrementUsage(userId: string, feature: string): Promise<number> {
  const windowStart = getWindowStart(feature)

  const counter = await db.usageCounter.upsert({
    where: { userId_feature_windowStart: { userId, feature, windowStart } },
    update: { count: { increment: 1 } },
    create: { userId, feature, windowStart, count: 1 },
  })

  return counter.count
}

/**
 * Check if user can perform an action.
 * Returns { allowed, current, limit } — no plan details exposed.
 */
export async function checkUsage(userId: string, plan: string, feature: string): Promise<{
  allowed: boolean
  current: number
  limit: number
}> {
  const limitKey = FEATURE_TO_LIMIT[feature]
  if (!limitKey) return { allowed: true, current: 0, limit: 999 }

  const limit = getLimits(plan)[limitKey] as number
  const current = await getUsage(userId, feature)

  return { allowed: current < limit, current, limit }
}

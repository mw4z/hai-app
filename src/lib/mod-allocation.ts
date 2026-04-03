import { db } from '@/lib/db'

// ─── Activity Levels & Mod Limits ───────────────────────────────────────────
//
// Activity is classified by a simple composite score:
//   score = postsPerDay + (reportsPerDay * 3) + (dauEstimate * 0.5)
//
// Thresholds:
//   LOW:    score < 10
//   MEDIUM: score 10–30
//   HIGH:   score > 30
//
// Mod limits per level:
//   LOW:    min 1, max 1
//   MEDIUM: min 2, max 3
//   HIGH:   min 3, max 5

type ActivityLevel = 'LOW' | 'MEDIUM' | 'HIGH'

const LIMITS: Record<ActivityLevel, { min: number; max: number }> = {
  LOW:    { min: 1, max: 1 },
  MEDIUM: { min: 2, max: 3 },
  HIGH:   { min: 3, max: 5 },
}

const ACTIVE_MOD_WINDOW_MS = 48 * 60 * 60 * 1000 // 48 hours

// ─── Activity Classification ────────────────────────────────────────────────

function classifyActivity(postsPerDay: number, reportsPerDay: number, dauEstimate: number): ActivityLevel {
  const score = postsPerDay + (reportsPerDay * 3) + (dauEstimate * 0.5)
  if (score > 30) return 'HIGH'
  if (score >= 10) return 'MEDIUM'
  return 'LOW'
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface ModCapacity {
  level: ActivityLevel
  minMods: number
  maxMods: number
  totalMods: number       // all mods assigned to this neighborhood
  activeMods: number      // mods with action in last 48h
  needsMods: boolean      // activeMods < minMods
  acceptingApps: boolean  // activeMods < maxMods
  vacancies: number       // max(0, minMods - activeMods)
}

/**
 * Calculate the mod capacity for a neighborhood.
 * Lightweight: 4 parallel queries, no complex joins.
 */
export async function getModCapacity(neighborhoodId: string): Promise<ModCapacity> {
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const activeWindow = new Date(now.getTime() - ACTIVE_MOD_WINDOW_MS)

  // Run queries in parallel
  const [postsToday, reportsToday, recentPosters, allMods] = await Promise.all([
    // Posts in last 24h
    db.post.count({
      where: { neighborhoodId, createdAt: { gte: oneDayAgo } },
    }),

    // Reports in last 24h
    db.post.count({
      where: { neighborhoodId, reportCount: { gt: 0 }, updatedAt: { gte: oneDayAgo } },
    }),

    // DAU estimate: unique posters + commenters in last 24h
    db.post.findMany({
      where: { neighborhoodId, createdAt: { gte: oneDayAgo } },
      select: { authorId: true },
      distinct: ['authorId'],
    }),

    // All neighborhood mods
    db.user.findMany({
      where: { neighborhoodId, role: 'NEIGHBORHOOD_MOD' },
      select: { id: true },
    }),
  ])

  const dauEstimate = recentPosters.length
  const level = classifyActivity(postsToday, reportsToday, dauEstimate)
  const { min, max } = LIMITS[level]
  const totalMods = allMods.length

  // Count active mods (at least 1 action in last 48h)
  let activeMods = 0
  if (allMods.length > 0) {
    const modIds = allMods.map(m => m.id)
    const activeModSet = await db.moderationLog.findMany({
      where: { adminId: { in: modIds }, createdAt: { gte: activeWindow } },
      select: { adminId: true },
      distinct: ['adminId'],
    })
    activeMods = activeModSet.length
  }

  // If neighborhood has mods but none are active, count at least those
  // who were approved recently (within 48h) as "active" — give them time to start
  if (activeMods === 0 && totalMods > 0) {
    const recentlyApproved = await db.user.count({
      where: {
        neighborhoodId,
        role: 'NEIGHBORHOOD_MOD',
        modApprovedAt: { gte: activeWindow },
      },
    })
    activeMods = recentlyApproved
  }

  return {
    level,
    minMods: min,
    maxMods: max,
    totalMods,
    activeMods,
    needsMods: activeMods < min,
    acceptingApps: activeMods < max,
    vacancies: Math.max(0, min - activeMods),
  }
}

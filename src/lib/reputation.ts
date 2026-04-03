import { db } from '@/lib/db'
import { log } from '@/lib/logger'

// Re-export pure functions so server code can import everything from one place
export { getRepLevel, getRepBadge, getFeedBoost, getPostLimit, getReportThreshold } from './reputation-levels'
export type { RepLevel } from './reputation-levels'

// ─── Reward Table (rebalanced: harder to gain, tied to real impact) ─────────
//
// Tiers:
//   Low impact (0–1):   simple interactions, social signals
//   Medium impact (2–3): service completion, helpful moderation
//   High impact (4–6):   ride completion, confirmed positive ratings
//
export const REP_POINTS = {
  // ── High impact (real trust-building actions) ──────────────────────────────
  ride_completed:         12,  // was 25 → ride completed successfully
  service_completed:      10,  // was 20 → service completed via thread
  positive_rating:        6,   // was 15 → explicit positive from another user

  // ── Medium impact ──────────────────────────────────────────────────────────
  report_validated:       3,   // report confirmed as valid by mod
  helpful_post:           3,   // post gets 5+ engagements (comments+reactions)

  // ── Low impact (social signals) ────────────────────────────────────────────
  reaction_received:      0,   // was 1 → reactions give 0 rep (too easy to farm)
  comment_engaged:        1,   // was 2 → someone liked your comment

  // ── Penalties (kept strong — abuse should hurt) ────────────────────────────
  report_confirmed:       -20,
  spam_detected:          -30,
  cancel_after_agreement: -15,
  negative_rating:        -10, // was -15
} as const

// ─── Anti-gaming limits ──────────────────────────────────────────────────────
const MAX_REP_PER_PAIR_PER_DAY = 2    // was 3 → tighter pair limit
const MAX_DAILY_GAIN = 12              // was 50 → much harder to farm
const NEW_USER_DAYS = 7
const NEW_USER_WEIGHT = 0.5

// ─── Diminishing Returns ─────────────────────────────────────────────────────
//
// Per action type per day:
//   First 3 → full reward
//   Next 3  → 50% reward
//   After 6 → 0 (no more points for this action today)
//
const DIMINISH_FULL = 3
const DIMINISH_HALF = 6  // after this count, reward = 0

async function getDiminishedPoints(userId: string, action: string, basePoints: number): Promise<number> {
  if (basePoints <= 0) return basePoints // penalties always apply fully

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const todayActionCount = await db.reputationLog.count({
    where: { userId, action, createdAt: { gte: startOfDay }, points: { gt: 0 } },
  })

  if (todayActionCount >= DIMINISH_HALF) return 0
  if (todayActionCount >= DIMINISH_FULL) return Math.max(1, Math.round(basePoints * 0.5))
  return basePoints
}

// ─── Core function ───────────────────────────────────────────────────────────

export async function addReputation(params: {
  userId: string
  fromUserId?: string
  action: string
  points: number
  postId?: string
}): Promise<boolean> {
  const { userId, fromUserId, action, postId } = params
  let { points } = params

  // Can't give rep to yourself
  if (fromUserId && fromUserId === userId) return false

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  if (fromUserId) {
    // Anti-abuse: pair limit
    const pairCount = await db.reputationLog.count({
      where: { userId, fromUserId, createdAt: { gte: startOfDay } },
    })
    if (pairCount >= MAX_REP_PER_PAIR_PER_DAY) {
      log.info('Rep pair limit hit', { route: 'reputation', userId, fromUserId, count: pairCount })
      return false
    }

    // Reduce weight if the giver is a new account
    if (points > 0) {
      const giver = await db.user.findUnique({
        where: { id: fromUserId },
        select: { createdAt: true },
      })
      if (giver) {
        const ageDays = (Date.now() - new Date(giver.createdAt).getTime()) / 86400_000
        if (ageDays < NEW_USER_DAYS) {
          points = Math.max(1, Math.round(points * NEW_USER_WEIGHT))
        }
      }
    }
  }

  // Diminishing returns per action type
  if (points > 0) {
    points = await getDiminishedPoints(userId, action, points)
    if (points === 0) {
      log.info('Rep diminished to 0', { route: 'reputation', userId, action })
      return false
    }
  }

  // Daily gain cap (only for positive points)
  if (points > 0) {
    const todayGains = await db.reputationLog.aggregate({
      where: { userId, points: { gt: 0 }, createdAt: { gte: startOfDay } },
      _sum: { points: true },
    })
    const totalToday = todayGains._sum.points || 0
    if (totalToday >= MAX_DAILY_GAIN) {
      log.info('Rep daily cap reached', { route: 'reputation', userId, totalToday })
      return false
    }
    if (totalToday + points > MAX_DAILY_GAIN) {
      points = MAX_DAILY_GAIN - totalToday
    }
  }

  if (points === 0) return false

  await db.reputationLog.create({
    data: { userId, fromUserId, action, points, postId },
  })

  await db.user.update({
    where: { id: userId },
    data: { reputation: { increment: points } },
  })

  log.info(`Rep ${points > 0 ? '+' : ''}${points}`, { route: 'reputation', userId, action })
  return true
}

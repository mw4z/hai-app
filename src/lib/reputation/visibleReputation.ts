import { db } from '@/lib/db'
import {
  DIRECTORY_SOURCE_TYPE, computeReputationBreakdown, type ReputationBreakdown,
} from './directoryRewards'

/**
 * The user-facing reputation breakdown: ONE visible total ("السمعة") that
 * merges the social score (User.reputation) with source-tagged directory
 * ReputationEvent points, split for explanation only. DISPLAY ONLY —
 * enforcement must use getEffectiveReputationForEnforcement.
 */
export async function getReputationBreakdown(userId: string): Promise<ReputationBreakdown> {
  const [user, events] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { reputation: true } }),
    db.reputationEvent.groupBy({
      by: ['reason'],
      where: { userId, sourceType: DIRECTORY_SOURCE_TYPE },
      _sum: { points: true },
    }),
  ])
  return computeReputationBreakdown(
    user?.reputation ?? 0,
    events.map((e) => ({ reason: e.reason, points: e._sum.points || 0 })),
  )
}

export async function getVisibleReputation(userId: string): Promise<number> {
  return (await getReputationBreakdown(userId)).total
}

/**
 * Enforcement seam. TODAY this returns the SOCIAL score only — directory
 * points do NOT affect report weight / auto-hide / moderation eligibility /
 * tiers. A later version may fold in capped/weighted directory points here,
 * in ONE place, without changing every enforcement call site.
 */
export async function getEffectiveReputationForEnforcement(userId: string): Promise<number> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { reputation: true } })
  return user?.reputation ?? 0
}

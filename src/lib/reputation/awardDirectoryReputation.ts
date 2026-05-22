import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import {
  pointsForContribution, reasonForContribution, decideAward,
  DIRECTORY_SOURCE_TYPE, type ContributionType,
} from './directoryRewards'

export interface AwardResult {
  awarded: number
  reason: 'ok' | 'no_points' | 'already' | 'dup_place_type' | 'capped'
}

/**
 * Award reputation for an APPROVED directory contribution — idempotently.
 * Safe to call repeatedly (re-approve): the unique (sourceType, sourceId)
 * on ReputationEvent + the `already` short-circuit guarantee a source pays
 * exactly once. Enforces the 15/day directory cap and the per-(place,type)
 * anti-farm guard. Never awards for non-APPROVED contributions.
 */
export async function awardDirectoryReputation(opts: {
  contributionId: string
  userId: string
  type: ContributionType
  placeId?: string | null
  highQuality?: boolean
}): Promise<AwardResult> {
  const { contributionId, userId, type, placeId, highQuality = false } = opts
  const base = pointsForContribution(type, 'APPROVED', highQuality)

  // Gather the facts decideAward needs.
  const [existing, prior, agg] = await Promise.all([
    db.reputationEvent.findUnique({
      where: { sourceType_sourceId: { sourceType: DIRECTORY_SOURCE_TYPE, sourceId: contributionId } },
      select: { id: true },
    }),
    placeId
      ? db.directoryContribution.count({
          where: { contributorId: userId, type, placeId, status: 'APPROVED', id: { not: contributionId } },
        })
      : Promise.resolve(0),
    (() => {
      const start = new Date(); start.setHours(0, 0, 0, 0)
      return db.reputationEvent.aggregate({
        where: { userId, sourceType: DIRECTORY_SOURCE_TYPE, createdAt: { gte: start } },
        _sum: { points: true },
      })
    })(),
  ])

  const decision = decideAward({
    base,
    alreadyAwarded: !!existing,
    priorSamePlaceType: prior > 0,
    dailyTotal: agg._sum.points || 0,
  })
  if (decision.award <= 0) return { awarded: 0, reason: decision.reason }

  try {
    // Directory points live ONLY in the source-tagged ReputationEvent — we
    // deliberately do NOT increment User.reputation. User.reputation stays
    // the SOCIAL score that enforcement (report weight / auto-hide / mod
    // eligibility / tiers) reads, so directory contributions never shift
    // those. The visible "السمعة" total merges the two for DISPLAY only
    // (see lib/reputation/visibleReputation). Audit provenance is kept.
    await db.reputationEvent.create({
      data: {
        userId,
        sourceType: DIRECTORY_SOURCE_TYPE,
        sourceId: contributionId,
        points: decision.award,
        reason: reasonForContribution(type, highQuality),
      },
    })
    return { awarded: decision.award, reason: 'ok' }
  } catch (e) {
    // Race: a concurrent approve already inserted the event.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { awarded: 0, reason: 'already' }
    }
    throw e
  }
}

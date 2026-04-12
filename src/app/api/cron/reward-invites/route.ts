import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computeInviteBadgeTier } from '@/lib/invites'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BATCH_LIMIT = 300
const MIN_WAIT_MS = 48 * 60 * 60_000 // 48h delay
const MAX_WAIT_MS = 14 * 24 * 60 * 60_000 // 14 days max pending
const DAILY_VELOCITY_LIMIT = 5
const IP_WINDOW_MS = 60 * 60_000
const REP_REWARD_INVITER = 50
const REP_REWARD_INVITEE = 20

export async function GET(req: NextRequest) {
  return handle(req)
}
export async function POST(req: NextRequest) {
  return handle(req)
}

async function handle(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') != null
  const auth = req.headers.get('authorization') || ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron) {
    if (!expected || auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const now = Date.now()
  const earliest = new Date(now - MIN_WAIT_MS)
  const oldest = new Date(now - MAX_WAIT_MS)

  const summary = {
    ok: true,
    processed: 0,
    rewarded: 0,
    rejected: 0,
    stillPending: 0,
    stale: 0,
  }

  // ── Reject stale (>14 days) ─────────────────────────────────────────
  try {
    const stale = await db.inviteRedemption.findMany({
      where: { status: 'PENDING', createdAt: { lt: oldest } },
      take: BATCH_LIMIT,
      select: { id: true },
    })
    if (stale.length) {
      const ids = stale.map((s) => s.id)
      await db.inviteRedemption.updateMany({
        where: { id: { in: ids } },
        data: { status: 'REJECTED', rejectedReason: 'stale' },
      })
      summary.stale = ids.length
    }
  } catch (err) {
    console.error('[REWARD_INVITES] stale pass failed', err)
  }

  const pending = await db.inviteRedemption.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lte: earliest, gte: oldest },
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH_LIMIT,
  })

  for (const r of pending) {
    summary.processed++
    try {
      const [inviter, invitee] = await Promise.all([
        db.user.findUnique({
          where: { id: r.inviterId },
          select: {
            id: true,
            status: true,
            createdAt: true,
            signupDeviceId: true,
            signupIpHash: true,
          },
        }),
        db.user.findUnique({
          where: { id: r.inviteeId },
          select: {
            id: true,
            status: true,
            createdAt: true,
            neighborhoodId: true,
            isVerified: true,
            signupDeviceId: true,
            signupIpHash: true,
          },
        }),
      ])

      if (!inviter || !invitee) {
        await rejectRedemption(r.id, 'missing_user')
        summary.rejected++
        continue
      }

      if (
        inviter.status === 'BANNED_TEMP' ||
        inviter.status === 'BANNED_PERM' ||
        invitee.status === 'BANNED_TEMP' ||
        invitee.status === 'BANNED_PERM'
      ) {
        await logFraud(invitee.id, 'orphan_signup', {
          reason: 'banned',
          redemptionId: r.id,
        })
        await rejectRedemption(r.id, 'banned')
        summary.rejected++
        continue
      }

      const inviteeDevice = invitee.signupDeviceId || r.signupDeviceId
      if (
        inviteeDevice &&
        inviter.signupDeviceId &&
        inviteeDevice === inviter.signupDeviceId
      ) {
        await logFraud(invitee.id, 'shared_device', {
          inviterId: inviter.id,
          redemptionId: r.id,
        })
        await rejectRedemption(r.id, 'shared_device')
        summary.rejected++
        continue
      }

      const inviteeIp = invitee.signupIpHash || r.signupIpHash
      if (
        inviteeIp &&
        inviter.signupIpHash &&
        inviteeIp === inviter.signupIpHash
      ) {
        const signupGap = Math.abs(
          invitee.createdAt.getTime() - inviter.createdAt.getTime(),
        )
        if (signupGap < IP_WINDOW_MS) {
          await logFraud(invitee.id, 'shared_ip', {
            inviterId: inviter.id,
            redemptionId: r.id,
            gapMs: signupGap,
          })
          await rejectRedemption(r.id, 'shared_ip')
          summary.rejected++
          continue
        }
      }

      const todayStart = new Date()
      todayStart.setUTCHours(0, 0, 0, 0)
      const todayRewarded = await db.inviteRedemption.count({
        where: {
          inviterId: inviter.id,
          status: 'REWARDED',
          rewardedAt: { gte: todayStart },
        },
      })
      if (todayRewarded >= DAILY_VELOCITY_LIMIT) {
        await logFraud(invitee.id, 'velocity', {
          inviterId: inviter.id,
          todayRewarded,
        })
        summary.stillPending++
        continue
      }

      const { action1At, d2ReturnAt } = await evaluateQualification(
        invitee.id,
        invitee.createdAt,
      )
      if (!action1At || !d2ReturnAt) {
        if (action1At || d2ReturnAt) {
          await db.inviteRedemption.update({
            where: { id: r.id },
            data: { action1At, d2ReturnAt },
          })
        }
        summary.stillPending++
        continue
      }

      if (!invitee.neighborhoodId || !invitee.isVerified) {
        summary.stillPending++
        continue
      }

      await db.$transaction(async (tx) => {
        await tx.inviteRedemption.update({
          where: { id: r.id },
          data: {
            status: 'REWARDED',
            action1At,
            d2ReturnAt,
            rewardedAt: new Date(),
          },
        })
        const updatedInviter = await tx.user.update({
          where: { id: inviter.id },
          data: {
            reputation: { increment: REP_REWARD_INVITER },
            invitesQualified: { increment: 1 },
          },
          select: { invitesQualified: true },
        })
        const newTier = computeInviteBadgeTier(updatedInviter.invitesQualified)
        await tx.user.update({
          where: { id: inviter.id },
          data: { inviteBadgeTier: newTier },
        })
        await tx.user.update({
          where: { id: invitee.id },
          data: { reputation: { increment: REP_REWARD_INVITEE } },
        })
      })
      summary.rewarded++
      console.log('[REWARD_INVITES] rewarded', {
        redemptionId: r.id,
        inviterId: inviter.id,
        inviteeId: invitee.id,
      })
    } catch (err) {
      console.error('[REWARD_INVITES] processing error', {
        redemptionId: r.id,
        err,
      })
    }
  }

  console.log('[REWARD_INVITES] done', summary)
  return NextResponse.json(summary)
}

async function rejectRedemption(id: string, reason: string) {
  await db.inviteRedemption.update({
    where: { id },
    data: { status: 'REJECTED', rejectedReason: reason },
  })
}

async function logFraud(userId: string, kind: string, detail: unknown) {
  try {
    await db.inviteFraudSignal.create({
      data: { userId, kind, detail: detail as any },
    })
  } catch (err) {
    console.error('[REWARD_INVITES] fraud log failed', { userId, kind, err })
  }
}

async function evaluateQualification(
  inviteeId: string,
  signupAt: Date,
): Promise<{ action1At: Date | null; d2ReturnAt: Date | null }> {
  const [firstPost, firstComment] = await Promise.all([
    db.post.findFirst({
      where: { authorId: inviteeId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    db.comment.findFirst({
      where: { authorId: inviteeId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ])
  const action1Candidates = [firstPost?.createdAt, firstComment?.createdAt]
    .filter((d): d is Date => Boolean(d))
    .map((d) => d.getTime())
  const action1At =
    action1Candidates.length > 0 ? new Date(Math.min(...action1Candidates)) : null

  const d2Threshold = new Date(signupAt.getTime() + 24 * 60 * 60_000)
  const [latePost, lateComment] = await Promise.all([
    db.post.findFirst({
      where: { authorId: inviteeId, createdAt: { gte: d2Threshold } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    db.comment.findFirst({
      where: { authorId: inviteeId, createdAt: { gte: d2Threshold } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ])
  const d2Candidates = [latePost?.createdAt, lateComment?.createdAt]
    .filter((d): d is Date => Boolean(d))
    .map((d) => d.getTime())
  const d2ReturnAt =
    d2Candidates.length > 0 ? new Date(Math.min(...d2Candidates)) : null

  return { action1At, d2ReturnAt }
}

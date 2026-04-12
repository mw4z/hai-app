import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import {
  generateInviteCode,
  computeInviteBadgeTier,
  nextTierThreshold,
  shareUrl,
} from '@/lib/invites'

export const dynamic = 'force-dynamic'

async function ensureCode(userId: string): Promise<string> {
  const existing = await db.inviteCode.findUnique({ where: { userId } })
  if (existing) return existing.code

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateInviteCode()
    try {
      const row = await db.inviteCode.create({ data: { userId, code } })
      return row.code
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err
      const concurrent = await db.inviteCode.findUnique({ where: { userId } })
      if (concurrent) return concurrent.code
      // else: code collision — retry
    }
  }
  throw new Error('could not generate unique invite code')
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const [code, user, counts] = await Promise.all([
    ensureCode(session.userId),
    db.user.findUnique({
      where: { id: session.userId },
      select: { invitesQualified: true, inviteBadgeTier: true },
    }),
    db.inviteRedemption.groupBy({
      by: ['status'],
      where: { inviterId: session.userId },
      _count: true,
    }),
  ])

  const counter = { pending: 0, qualified: 0, rewarded: 0, rejected: 0 }
  for (const c of counts) {
    if (c.status === 'PENDING') counter.pending = c._count
    else if (c.status === 'QUALIFIED') counter.qualified = c._count
    else if (c.status === 'REWARDED') counter.rewarded = c._count
    else if (c.status === 'REJECTED') counter.rejected = c._count
  }

  const qualified = user?.invitesQualified ?? 0
  const tier = user?.inviteBadgeTier ?? computeInviteBadgeTier(qualified)

  return NextResponse.json({
    code,
    shareUrl: shareUrl(code),
    pending: counter.pending,
    qualified,
    rewarded: counter.rewarded,
    badgeTier: tier,
    nextTierAt: nextTierThreshold(qualified),
  })
}

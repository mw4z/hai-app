import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { nextTierThreshold } from '@/lib/invites'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      invitedById: true,
      invitesQualified: true,
      inviteBadgeTier: true,
    },
  })
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const [invitedBy, invited, counts] = await Promise.all([
    me.invitedById
      ? db.user.findUnique({
          where: { id: me.invitedById },
          select: { id: true, name: true, inviteBadgeTier: true },
        })
      : Promise.resolve(null),
    db.inviteRedemption.findMany({
      where: { inviterId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        status: true,
        createdAt: true,
        rewardedAt: true,
        invitee: { select: { id: true, name: true } },
      },
    }),
    db.inviteRedemption.groupBy({
      by: ['status'],
      where: { inviterId: session.userId },
      _count: true,
    }),
  ])

  const byStatus = { pending: 0, qualified: 0, rewarded: 0, rejected: 0 }
  for (const c of counts) {
    if (c.status === 'PENDING') byStatus.pending = c._count
    else if (c.status === 'QUALIFIED') byStatus.qualified = c._count
    else if (c.status === 'REWARDED') byStatus.rewarded = c._count
    else if (c.status === 'REJECTED') byStatus.rejected = c._count
  }

  return NextResponse.json({
    invitedBy,
    invited: invited.map((r) => ({
      id: r.invitee.id,
      name: r.invitee.name,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      rewardedAt: r.rewardedAt?.toISOString() ?? null,
    })),
    counts: byStatus,
    badgeTier: me.inviteBadgeTier,
    qualified: me.invitesQualified,
    nextTierAt: nextTierThreshold(me.invitesQualified),
  })
}

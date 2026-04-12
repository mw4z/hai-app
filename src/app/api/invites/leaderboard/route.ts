import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const scope = url.searchParams.get('scope') || 'neighborhood'
  const limit = Math.min(
    parseInt(url.searchParams.get('limit') || '10', 10) || 10,
    50,
  )

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { neighborhoodId: true },
  })

  const where: any = { invitesQualified: { gt: 0 } }
  if (scope === 'neighborhood') {
    if (!me?.neighborhoodId) return NextResponse.json({ leaders: [] })
    where.neighborhoodId = me.neighborhoodId
  }

  const leaders = await db.user.findMany({
    where,
    orderBy: [{ invitesQualified: 'desc' }, { inviteBadgeTier: 'desc' }],
    take: limit,
    select: {
      id: true,
      name: true,
      invitesQualified: true,
      inviteBadgeTier: true,
    },
  })

  return NextResponse.json({
    scope,
    leaders: leaders.map((u) => ({
      userId: u.id,
      name: u.name,
      qualifiedCount: u.invitesQualified,
      badgeTier: u.inviteBadgeTier,
    })),
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

const MOD_ROLES = new Set(['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN'])

/**
 * GET /api/mod/poll-requests — pending poll suggestions for the mod's
 * scope. NEIGHBORHOOD_MOD sees their neighborhood only; PLATFORM_MOD /
 * SUPER_ADMIN see all neighborhoods.
 *
 * Query params:
 *   ?status=PENDING|APPROVED|REJECTED (default: PENDING)
 *   ?take=50 (default 50, max 100)
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true },
  })
  if (!me || !MOD_ROLES.has(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const statusParam = (searchParams.get('status') || 'PENDING').toUpperCase()
  const status = (['PENDING', 'APPROVED', 'REJECTED'] as const).includes(statusParam as any)
    ? (statusParam as 'PENDING' | 'APPROVED' | 'REJECTED')
    : 'PENDING'
  const take = Math.min(Math.max(Number(searchParams.get('take')) || 50, 1), 100)

  const isPlatform = me.role === 'PLATFORM_MOD' || me.role === 'SUPER_ADMIN'
  const where = isPlatform
    ? { status }
    : { status, neighborhoodId: me.neighborhoodId! }

  const requests = await db.pollRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      title: true,
      description: true,
      options: true,
      reason: true,
      status: true,
      rejectionReason: true,
      reviewedAt: true,
      titleOriginal: true,
      optionsOriginal: true,
      approvedPollId: true,
      createdAt: true,
      neighborhoodId: true,
      // Requester identity is mod-visible (we need to know who proposed
      // it for context, and for the reputation-based rate limit). It is
      // NEVER exposed back to PollCard viewers — that's enforced on the
      // approve path which only writes the title/options into Poll.
      user: { select: { id: true, name: true, lastName: true, reputation: true, avatarUrl: true } },
      neighborhood: { select: { name: true, nameEn: true } },
    },
  })

  return NextResponse.json(requests)
}

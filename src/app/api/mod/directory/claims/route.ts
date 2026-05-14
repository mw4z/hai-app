import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { gateModRoute } from '@/lib/places/routeGate'

export const dynamic = 'force-dynamic'

/** GET /api/mod/directory/claims
 *  Pending PlaceClaimRequest rows for the mod's neighborhood
 *  (PLATFORM_MOD / SUPER_ADMIN see all). */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const gate = gateModRoute(user.role)
  if (gate) return gate

  const cross = isSuperAdminRole(user.role) || user.role === 'PLATFORM_MOD'

  const claims = await db.placeClaimRequest.findMany({
    where: {
      status: 'PENDING',
      ...(cross
        ? {}
        : {
            place: { neighborhoodId: user.neighborhoodId ?? '__none__' },
          }),
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
    include: {
      user: { select: { id: true, name: true, providerStatus: true, reputation: true } },
      place: {
        select: {
          id: true, name: true, category: true, status: true, neighborhoodId: true,
          claimedByUserId: true,
        },
      },
    },
  })

  return NextResponse.json({
    claims: claims.map((c) => ({
      id: c.id,
      message: c.message,
      createdAt: c.createdAt.toISOString(),
      place: c.place,
      user: c.user,
    })),
  })
}

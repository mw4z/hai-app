import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { gateModRoute } from '@/lib/places/routeGate'
import { toModPlace } from '@/lib/places/serialize'

export const dynamic = 'force-dynamic'

/** GET /api/mod/directory
 *  Pending PlaceListing submissions for the moderator's
 *  neighborhood. PLATFORM_MOD / SUPER_ADMIN see all neighborhoods
 *  unless ?neighborhood=<id> is passed (then scoped to that one). */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const gate = gateModRoute(user.role)
  if (gate) return gate

  const url = req.nextUrl
  const cross = isSuperAdminRole(user.role) || user.role === 'PLATFORM_MOD'
  const filterNbhd =
    cross && url.searchParams.get('neighborhood')
      ? String(url.searchParams.get('neighborhood'))
      : !cross
        ? user.neighborhoodId
        : null

  const places = await db.placeListing.findMany({
    where: {
      status: 'PENDING',
      ...(filterNbhd ? { neighborhoodId: filterNbhd } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
    include: {
      claimedByUser: { select: { id: true, name: true, avatarUrl: true, providerStatus: true } },
      createdByUser: { select: { id: true, name: true } },
      verifiedByMod:  { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({ places: places.map(toModPlace) })
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { gateModRoute } from '@/lib/places/routeGate'
import { toModPlace } from '@/lib/places/serialize'

export const dynamic = 'force-dynamic'

/** GET /api/mod/directory/[id]
 *  Mod-facing place detail. Returns the ModPlace shape (includes
 *  createdByUser + verifiedByMod for accountability) PLUS recent
 *  reports[] so mods can review reported places without a separate
 *  round trip. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const gate = gateModRoute(user.role)
  if (gate) return gate

  const place = await db.placeListing.findUnique({
    where: { id: params.id },
    include: {
      claimedByUser: { select: { id: true, name: true, avatarUrl: true, providerStatus: true } },
      createdByUser: { select: { id: true, name: true } },
      verifiedByMod:  { select: { id: true, name: true } },
    },
  })
  if (!place) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // NEIGHBORHOOD_MOD scoping: only see places in their own nbhd.
  if (
    user.role === 'NEIGHBORHOOD_MOD' &&
    place.neighborhoodId !== user.neighborhoodId
  ) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  // PLATFORM_MOD / SUPER_ADMIN see across nbhds — no extra check.
  void isSuperAdminRole

  const reports = await db.placeReport.findMany({
    where: { placeId: place.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      type: true,
      message: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json({
    place: toModPlace(place),
    reports: reports.map((r) => ({
      id: r.id,
      type: r.type,
      message: r.message,
      createdAt: r.createdAt.toISOString(),
      reporter: r.user,
    })),
  })
}

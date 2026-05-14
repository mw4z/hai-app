import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { gatePublicRoute } from '@/lib/places/routeGate'
import { toPublicPlace } from '@/lib/places/serialize'

export const dynamic = 'force-dynamic'

/** GET /api/directory/mine
 *
 *  Returns two arrays for the /directory/mine page:
 *    - created: places the user submitted (any status they own)
 *    - claimed: places the user has claimed (status CLAIMED_BY_OWNER)
 *    - pendingClaims: PlaceClaimRequest rows with status=PENDING
 *
 *  This is the only public endpoint that returns a user's own
 *  rejected / pending rows back to them. Both lists go through
 *  toPublicPlace, so the response shape matches the rest of the
 *  directory APIs (no createdByUser, etc.). */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const gate = gatePublicRoute(user.role)
  if (gate) return gate

  const [created, claimed, pendingClaims] = await Promise.all([
    db.placeListing.findMany({
      where: { createdByUserId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        claimedByUser: {
          select: { id: true, name: true, avatarUrl: true, providerStatus: true },
        },
      },
    }),
    db.placeListing.findMany({
      where: { claimedByUserId: session.userId, status: 'CLAIMED_BY_OWNER' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        claimedByUser: {
          select: { id: true, name: true, avatarUrl: true, providerStatus: true },
        },
      },
    }),
    db.placeClaimRequest.findMany({
      where: { userId: session.userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        place: {
          select: { id: true, name: true, category: true, status: true, neighborhoodId: true },
        },
      },
    }),
  ])

  return NextResponse.json({
    created: created.map(toPublicPlace),
    claimed: claimed.map(toPublicPlace),
    pendingClaims: pendingClaims.map((c) => ({
      id: c.id,
      placeId: c.placeId,
      placeName: c.place.name,
      placeCategory: c.place.category,
      message: c.message,
      createdAt: c.createdAt.toISOString(),
    })),
  })
}

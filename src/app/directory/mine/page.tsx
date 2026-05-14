import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { ssrPublicGateOrNotFound } from '@/lib/places/ssrGate'
import { toPublicPlace } from '@/lib/places/serialize'
import MineClient from './MineClient'

export const dynamic = 'force-dynamic'

export default async function MyPlacesPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!user) redirect('/login')

  ssrPublicGateOrNotFound(user.role)

  const [created, claimed, pendingClaims] = await Promise.all([
    db.placeListing.findMany({
      where: { createdByUserId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        claimedByUser: { select: { id: true, name: true, avatarUrl: true, providerStatus: true } },
      },
    }),
    db.placeListing.findMany({
      where: { claimedByUserId: user.id, status: 'CLAIMED_BY_OWNER' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        claimedByUser: { select: { id: true, name: true, avatarUrl: true, providerStatus: true } },
      },
    }),
    db.placeClaimRequest.findMany({
      where: { userId: user.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        place: { select: { id: true, name: true, category: true, status: true } },
      },
    }),
  ])

  return (
    <MineClient
      created={created.map(toPublicPlace)}
      claimed={claimed.map(toPublicPlace)}
      pendingClaims={pendingClaims.map((c) => ({
        id: c.id,
        placeId: c.placeId,
        placeName: c.place.name,
        placeCategory: c.place.category,
        message: c.message,
        createdAt: c.createdAt.toISOString(),
      }))}
    />
  )
}

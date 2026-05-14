import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { ssrPublicGateOrNotFound } from '@/lib/places/ssrGate'
import { toPublicPlace } from '@/lib/places/serialize'
import { PUBLIC_PLACE_STATUSES } from '@/lib/places/statusBadge'
import DirectoryClient from './DirectoryClient'

export const dynamic = 'force-dynamic'

/** SSR list page. Fetches the first 30 visible places in the
 *  user's neighborhood; client component handles search +
 *  category filtering against this initial slice and falls back
 *  to the API for filtered re-fetches. */
export default async function DirectoryPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true, name: true },
  })
  if (!user) redirect('/login')

  ssrPublicGateOrNotFound(user.role)

  if (!user.neighborhoodId) {
    // Same fallback the rest of the app uses for incomplete profiles.
    redirect('/onboarding')
  }

  const places = await db.placeListing.findMany({
    where: {
      neighborhoodId: user.neighborhoodId,
      status: { in: PUBLIC_PLACE_STATUSES },
    },
    orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
    take: 30,
    include: {
      claimedByUser: {
        select: { id: true, name: true, avatarUrl: true, providerStatus: true },
      },
    },
  })

  return <DirectoryClient initialPlaces={places.map(toPublicPlace)} />
}

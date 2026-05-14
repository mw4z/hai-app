import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { ssrPublicGateOrNotFound } from '@/lib/places/ssrGate'
import { toPublicPlace } from '@/lib/places/serialize'
import { PUBLIC_PLACE_STATUSES } from '@/lib/places/statusBadge'
import DirectoryClient from './DirectoryClient'

export const dynamic = 'force-dynamic'

/** SSR list page.
 *
 *  Supports cross-neighborhood read via ?neighborhood=<id> — same
 *  pattern as /feed. When browsing another neighborhood, the
 *  directory shows THAT neighborhood's places (read-only), the
 *  "Add a place" button is hidden, and the browse-mode banner
 *  is rendered. Submitting / claiming / reporting still requires
 *  the user to be in the target neighborhood (server-enforced). */
export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: { neighborhood?: string }
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true, name: true },
  })
  if (!user) redirect('/login')

  ssrPublicGateOrNotFound(user.role)

  if (!user.neighborhoodId) redirect('/onboarding')

  // Browse-mode resolution — identical shape to /feed's SSR.
  const browseNeighborhoodId = searchParams?.neighborhood
  const isReadOnly = !!(
    browseNeighborhoodId && browseNeighborhoodId !== user.neighborhoodId
  )
  const activeNeighborhoodId = isReadOnly
    ? browseNeighborhoodId!
    : user.neighborhoodId!

  // When browsing another nbhd, fetch its display name so the
  // banner can say WHICH neighborhood the user is viewing.
  let browseNeighborhood:
    | { id: string; name: string; nameEn: string | null }
    | null = null
  if (isReadOnly) {
    browseNeighborhood = await db.neighborhood.findUnique({
      where: { id: activeNeighborhoodId },
      select: { id: true, name: true, nameEn: true },
    })
    // Fall back to user's own nbhd if the param points at nothing real.
    if (!browseNeighborhood) redirect('/directory')
  }

  const places = await db.placeListing.findMany({
    where: {
      neighborhoodId: activeNeighborhoodId,
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

  return (
    <DirectoryClient
      initialPlaces={places.map(toPublicPlace)}
      isReadOnly={isReadOnly}
      browseNeighborhood={browseNeighborhood}
    />
  )
}

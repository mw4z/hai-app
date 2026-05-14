import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { directoryServerMode } from '@/lib/places/featureFlag'
import { isDirectoryModerator } from '@/lib/places/isDirectoryModerator'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { toModPlace } from '@/lib/places/serialize'
import ModDirectoryClient from './ModDirectoryClient'

export const dynamic = 'force-dynamic'

/** Mod-only directory dashboard. Three tabs: pending places,
 *  pending claims, recent reports. Each row has the right inline
 *  actions for the row's domain (approve / reject / open detail). */
export default async function ModDirectoryPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true },
  })
  if (!user) redirect('/login')

  // Server-flag gate: even in admin mode this page is reachable
  // by directory moderators only. RESIDENTs / COMPOUND_ADMINs hit
  // notFound() here.
  const mode = directoryServerMode()
  if (mode === 'off' && !isSuperAdminRole(user.role)) notFound()
  if (mode === 'admin' && !isDirectoryModerator(user.role)) notFound()
  if (mode === 'on' && !isDirectoryModerator(user.role)) notFound()

  const cross = isSuperAdminRole(user.role) || user.role === 'PLATFORM_MOD'
  const nbhdScope = cross ? {} : { neighborhoodId: user.neighborhoodId ?? '__none__' }

  const [pendingPlaces, pendingClaims, recentReports] = await Promise.all([
    db.placeListing.findMany({
      where: { status: 'PENDING', ...nbhdScope },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: {
        claimedByUser: { select: { id: true, name: true, avatarUrl: true, providerStatus: true } },
        createdByUser: { select: { id: true, name: true } },
        verifiedByMod:  { select: { id: true, name: true } },
      },
    }),
    db.placeClaimRequest.findMany({
      where: {
        status: 'PENDING',
        ...(cross ? {} : { place: { neighborhoodId: user.neighborhoodId ?? '__none__' } }),
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: {
        user: { select: { id: true, name: true, providerStatus: true, reputation: true } },
        place: { select: { id: true, name: true, category: true, status: true } },
      },
    }),
    db.placeReport.findMany({
      where: cross
        ? {}
        : { place: { neighborhoodId: user.neighborhoodId ?? '__none__' } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, name: true } },
        place: { select: { id: true, name: true, category: true, status: true } },
      },
    }),
  ])

  return (
    <ModDirectoryClient
      data={JSON.parse(JSON.stringify({
        pendingPlaces: pendingPlaces.map(toModPlace),
        pendingClaims: pendingClaims.map((c) => ({
          id: c.id,
          message: c.message,
          createdAt: c.createdAt.toISOString(),
          user: c.user,
          place: c.place,
        })),
        recentReports: recentReports.map((r) => ({
          id: r.id,
          type: r.type,
          message: r.message,
          createdAt: r.createdAt.toISOString(),
          reporter: r.user,
          place: r.place,
        })),
      }))}
    />
  )
}

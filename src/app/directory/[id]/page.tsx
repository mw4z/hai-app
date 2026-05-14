import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { ssrPublicGateOrNotFound } from '@/lib/places/ssrGate'
import { toPublicPlace } from '@/lib/places/serialize'
import { PUBLIC_PLACE_STATUSES } from '@/lib/places/statusBadge'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { isDirectoryModerator } from '@/lib/places/isDirectoryModerator'
import DetailClient from './DetailClient'

export const dynamic = 'force-dynamic'

export default async function PlaceDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!user) redirect('/login')

  ssrPublicGateOrNotFound(user.role)

  const place = await db.placeListing.findUnique({
    where: { id: params.id },
    include: {
      claimedByUser: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          providerStatus: true,
          serviceItems: {
            where: { active: true },
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true, title: true, description: true,
              price: true, imageUrl: true, active: true, sortOrder: true,
            },
            take: 20,
          },
        },
      },
    },
  })
  if (!place) notFound()

  const isSuper = isSuperAdminRole(user.role)
  const isMod = isDirectoryModerator(user.role)
  const sameNbhd = place.neighborhoodId === user.neighborhoodId
  const isCreator = place.createdByUserId === user.id
  const isOwner = place.claimedByUserId === user.id
  const isPubliclyVisible = (PUBLIC_PLACE_STATUSES as string[]).includes(place.status)

  // Photo-edit gate — mirrors the PATCH route exactly:
  //   - owner exists → ONLY the owner edits. Admins step back
  //                    (they still moderate via /mod/directory).
  //   - no owner yet → creator + admins can curate.
  const hasOwner = !!place.claimedByUserId
  const isAdminScoped =
    isSuper || (isMod && (user.role === 'PLATFORM_MOD' || sameNbhd))
  const canEditPhotos =
    isOwner || (!hasOwner && (isCreator || isAdminScoped))

  // Visibility:
  //  - Publicly-visible places are readable cross-neighborhood
  //    (matches /api/directory GET — anyone can browse another
  //    neighborhood's directory, only writes are locked).
  //  - PENDING / REJECTED / REMOVED stay scoped: creator, owner,
  //    mod-of-that-nbhd, PLATFORM_MOD, SUPER_ADMIN.
  const allowed =
    isSuper ||
    (isMod && user.role === 'PLATFORM_MOD') ||
    (isMod && user.role === 'NEIGHBORHOOD_MOD' && sameNbhd) ||
    isCreator ||
    isOwner ||
    isPubliclyVisible
  if (!allowed) notFound()

  return (
    <DetailClient
      place={toPublicPlace(place)}
      isOwner={isOwner}
      isCreator={isCreator}
      canEditPhotos={canEditPhotos}
    />
  )
}

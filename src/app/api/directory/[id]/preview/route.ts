import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { gatePublicRoute } from '@/lib/places/routeGate'
import { isDirectoryModerator } from '@/lib/places/isDirectoryModerator'
import { PUBLIC_PLACE_STATUSES } from '@/lib/places/statusBadge'

export const dynamic = 'force-dynamic'

/**
 * GET /api/directory/[id]/preview
 *
 * Lean preview shape used by PlacePreviewCard when a directory
 * link appears inside a post body, comment, or chat message.
 *
 * Visibility mirrors GET /api/directory/[id]:
 *   - Auth required.
 *   - Server gate via gatePublicRoute() — residents 404 when
 *     DIRECTORY_ENABLED is off.
 *   - Place must be publicly-visible OR caller is creator /
 *     claimed owner / scoped mod.
 *   - Cross-neighborhood reads are read-only (visibility only,
 *     no PATCH path here anyway).
 *
 * Returns ONLY safe public fields. NEVER returns createdByUser,
 * reports, claim requests, rejectionReason, latitude/longitude.
 * Removed / rejected / out-of-scope places → 404 so the calling
 * card flips to the "unavailable" fallback state.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const gate = gatePublicRoute(user.role)
  if (gate) return gate

  const place = await db.placeListing.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      neighborhoodId: true,
      name: true,
      category: true,
      status: true,
      addressText: true,
      mapUrl: true,
      openingHours: true,
      manualStatus: true,
      manualStatusUntil: true,
      ratingAvg: true,
      ratingCount: true,
      createdByUserId: true,
      claimedByUserId: true,
      claimedByUser: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          providerStatus: true,
        },
      },
    },
  })
  if (!place) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const isSuper = isSuperAdminRole(user.role)
  const isMod = isDirectoryModerator(user.role)
  const sameNbhd = place.neighborhoodId === user.neighborhoodId
  const isCreator = place.createdByUserId === user.id
  const isOwner = place.claimedByUserId === user.id
  const isPubliclyVisible = (PUBLIC_PLACE_STATUSES as string[]).includes(place.status)

  // Visibility — exact mirror of the detail GET's `allowed` rule.
  // Removed / rejected places are NOT in PUBLIC_PLACE_STATUSES so
  // they don't slip through unless the caller is creator / owner /
  // matching-scope mod / super-admin.
  const allowed =
    isSuper ||
    (isMod && user.role === 'PLATFORM_MOD') ||
    (isMod && user.role === 'NEIGHBORHOOD_MOD' && sameNbhd) ||
    isCreator ||
    isOwner ||
    isPubliclyVisible
  if (!allowed) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Explicit whitelist — never spread the full row, never include
  // createdByUser / reports / claims / rejectionReason / lat / lng.
  return NextResponse.json({
    id: place.id,
    name: place.name,
    category: place.category,
    status: place.status,
    addressText: place.addressText,
    mapUrl: place.mapUrl,
    openingHours: place.openingHours,
    manualStatus: place.manualStatus,
    manualStatusUntil: place.manualStatusUntil
      ? place.manualStatusUntil.toISOString()
      : null,
    ratingAvg: place.ratingAvg,
    ratingCount: place.ratingCount,
    addedByCommunity: !!place.createdByUserId,
    claimedByUser: place.claimedByUser
      ? {
          id: place.claimedByUser.id,
          name: place.claimedByUser.name,
          avatarUrl: place.claimedByUser.avatarUrl,
          providerStatus: place.claimedByUser.providerStatus,
        }
      : null,
  })
}

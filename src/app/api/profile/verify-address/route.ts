import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { verifyNeighborhoodAssignment } from '@/lib/location/verify'
import { cacheDelete } from '@/lib/cache'
// (cache removed in the requireUserReady refactor — no-op left here as
// a comment so anyone hunting for the old invalidateVerifiedCache call
// site sees that nothing's needed.)

/**
 * POST /api/profile/verify-address
 *
 * Upgrade a guest (addressVerified=false) user to a verified member.
 * Requires fresh GPS coordinates that match either:
 *   - the user's current neighborhood polygon (precise), or
 *   - a neighborhood within the fallback radius (low-accuracy GPS)
 *
 * On success: sets addressVerified=true. The user's neighborhoodId may
 * also be updated if the coordinates map to a different neighborhood
 * than the one they chose during onboarding.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { lat, lng, accuracy, neighborhoodId } = body as {
    lat?: number
    lng?: number
    accuracy?: number
    neighborhoodId?: string
  }

  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'invalid_coordinates' }, { status: 400 })
  }
  if (!neighborhoodId) {
    return NextResponse.json({ error: 'neighborhoodId_required' }, { status: 400 })
  }

  const neighborhood = await db.neighborhood.findUnique({
    where: { id: neighborhoodId },
    select: { id: true, hidden: true, lat: true, lng: true, boundary: true, bbox: true },
  })
  if (!neighborhood || neighborhood.hidden) {
    return NextResponse.json({ error: 'neighborhood_not_found' }, { status: 404 })
  }

  const effectiveAccuracy = typeof accuracy === 'number' && accuracy > 0 ? accuracy : 9999
  const verdict = verifyNeighborhoodAssignment(lat, lng, effectiveAccuracy, neighborhood)

  if (verdict === 'rejected') {
    return NextResponse.json(
      { error: 'neighborhood_mismatch', message: 'الموقع لا يتطابق مع الحي المختار' },
      { status: 403 },
    )
  }

  await db.user.update({
    where: { id: session.userId },
    data: {
      neighborhoodId,
      addressVerified: true,
    },
  })

  cacheDelete(`user:${session.userId}`)

  return NextResponse.json({ success: true, verdict })
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { placeSnapshot } from '@/lib/places/googlePlaces'
import { logModAction } from '@/lib/modAudit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/mod/directory/[id]/google-link   (SUPER_ADMIN only)
 *
 * Enriches a place that was added the local way with a Google
 * Places snapshot. Body: { googlePlaceId, applyContact? }.
 *
 * Takes an authoritative server-side Place Details snapshot from the
 * place_id (never trusts client-sent rating/hours) and writes:
 *   source=GOOGLE, googlePlaceId, googleRating, googleRatingCount,
 *   googleHours, googlePhotoRefs, googleSyncedAt.
 *
 * The place's own name/category/address are left as the neighbors
 * entered them — unless applyContact is true, in which case missing
 * phone / website / coordinates are backfilled from Google (existing
 * values are never overwritten).
 *
 * SUPER_ADMIN only — narrower than the rest of the directory mod
 * surface, per request. Logged to ModActionLog.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true },
  })
  if (!user || !isSuperAdminRole(user.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const googlePlaceId =
    typeof raw?.googlePlaceId === 'string' && raw.googlePlaceId.length > 0 && raw.googlePlaceId.length < 300
      ? raw.googlePlaceId
      : null
  const applyContact = raw?.applyContact === true
  if (!googlePlaceId) {
    return NextResponse.json({ error: 'googlePlaceId مطلوب' }, { status: 400 })
  }

  const place = await db.placeListing.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      neighborhoodId: true,
      phone: true,
      whatsapp: true,
      website: true,
      latitude: true,
      longitude: true,
      mapUrl: true,
      openingHours: true,
    },
  })
  if (!place) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const snap = await placeSnapshot(googlePlaceId)
  if (!snap) {
    return NextResponse.json({ error: 'تعذّر جلب بيانات Google لهذا المكان' }, { status: 502 })
  }

  // Backfill contact ONLY when applyContact and the field is empty —
  // never clobber what neighbors already entered. Phone fills both
  // phone + whatsapp when each is empty (most KSA shops use one
  // number for both).
  const contactPatch = applyContact
    ? {
        phone: place.phone ?? snap.phone,
        whatsapp: place.whatsapp ?? snap.phone,
        website: place.website ?? snap.website,
        mapUrl: place.mapUrl ?? snap.mapUrl,
        latitude: place.latitude ?? snap.latitude,
        longitude: place.longitude ?? snap.longitude,
      }
    : {}

  const updated = await db.placeListing.update({
    where: { id: place.id },
    data: {
      source: 'GOOGLE',
      googlePlaceId,
      googleRating: snap.rating,
      googleRatingCount: snap.ratingCount,
      googleHours: snap.hours,
      googlePeriods:
        snap.periods && snap.periods.length > 0 ? (snap.periods as unknown as object) : undefined,
      googlePhotoRefs: snap.photoRefs,
      googleReviews:
        snap.reviews && snap.reviews.length > 0 ? (snap.reviews as unknown as object) : undefined,
      googleSyncedAt: new Date(),
      // openingHours left as-is — Google hours drive the pill via
      // googlePeriods, and an owner can still set manual hours.
      ...contactPatch,
    },
    select: { id: true },
  })

  await logModAction({
    moderatorId: user.id,
    actionType: 'link_place_google',
    targetType: 'place',
    targetId: place.id,
    neighborhoodId: place.neighborhoodId,
    details: JSON.stringify({ googlePlaceId, applyContact }),
  })

  return NextResponse.json({ ok: true, id: updated.id })
}

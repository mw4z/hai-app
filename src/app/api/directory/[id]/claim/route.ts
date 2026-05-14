import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { gatePublicRoute } from '@/lib/places/routeGate'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { validateMessage, CLAIM_PENDING_MAX } from '@/lib/places/validation'

export const dynamic = 'force-dynamic'

/** POST /api/directory/[id]/claim
 *  Body: { message?: string }
 *  Creates a PlaceClaimRequest in PENDING status. The user is
 *  capped at CLAIM_PENDING_MAX (3) open claims at any time —
 *  prevents farming claim requests against many places. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, status: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const gate = gatePublicRoute(user.role)
  if (gate) return gate

  const isSuper = isSuperAdminRole(user.role)
  if (!isSuper && (user.status === 'BANNED_TEMP' || user.status === 'BANNED_PERM')) {
    return NextResponse.json({ error: 'حسابك موقوف' }, { status: 403 })
  }

  const place = await db.placeListing.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, neighborhoodId: true, claimedByUserId: true },
  })
  if (!place) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (place.claimedByUserId) {
    return NextResponse.json({ error: 'already_claimed' }, { status: 409 })
  }
  if (place.status === 'REJECTED' || place.status === 'REMOVED') {
    return NextResponse.json({ error: 'not_claimable' }, { status: 409 })
  }
  // Cross-neighborhood claim attempts blocked unless SUPER_ADMIN.
  if (!isSuper && place.neighborhoodId !== user.neighborhoodId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Don't allow stacking duplicate pending claims for the same place.
  const existing = await db.placeClaimRequest.findFirst({
    where: { userId: user.id, placeId: place.id, status: 'PENDING' },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json({ error: 'already_requested' }, { status: 409 })
  }

  // Rate limit: ≤ CLAIM_PENDING_MAX open claims across all places.
  if (!isSuper) {
    const pending = await db.placeClaimRequest.count({
      where: { userId: user.id, status: 'PENDING' },
    })
    if (pending >= CLAIM_PENDING_MAX) {
      return NextResponse.json(
        { error: 'وصلت الحد الأقصى لطلبات الإدارة المعلّقة' },
        { status: 429 },
      )
    }
  }

  const body = (await req.json().catch(() => ({}))) as { message?: string }
  const msg = validateMessage(body.message)
  if (msg === false) return NextResponse.json({ error: 'الرسالة طويلة جداً' }, { status: 400 })

  const claim = await db.placeClaimRequest.create({
    data: {
      placeId: place.id,
      userId: user.id,
      message: msg,
      // evidenceUrls intentionally left default [] — Phase 1.5 wiring.
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: claim.id })
}

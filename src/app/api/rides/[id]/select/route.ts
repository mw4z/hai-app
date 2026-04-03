import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { log } from '@/lib/logger'
import { logRideEvent } from '@/lib/rides/events'
import { notifyDriverSelected, notifyOffersPassed } from '@/lib/rides/notify'

const CONFIRM_DEADLINE_MIN = 5

/** POST — Requester selects an offer (transaction-safe) */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', `/api/rides/${params.id}/select`, session.userId)

    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { offerId } = body
    if (!offerId) return NextResponse.json({ error: 'offerId required' }, { status: 400 })

    // Verify the offer exists and belongs to this ride
    const offer = await db.rideOffer.findUnique({
      where: { id: offerId },
      select: { id: true, rideRequestId: true, driverId: true, status: true },
    })
    if (!offer || offer.rideRequestId !== params.id) {
      return NextResponse.json({ error: 'العرض غير موجود' }, { status: 404 })
    }
    if (offer.status !== 'OFFER_PENDING') {
      log.warn('Attempted to select non-pending offer', {
        route: `/api/rides/${params.id}/select`,
        userId: session.userId,
        offerId,
        offerStatus: offer.status,
      })
      return NextResponse.json({ error: 'العرض لم يعد متاحاً' }, { status: 409 })
    }

    // ── Atomic selection (race-condition safe) ──────────────────────────────────
    const confirmDeadline = new Date(Date.now() + CONFIRM_DEADLINE_MIN * 60 * 1000)

    const result = await db.rideRequest.updateMany({
      where: {
        id: params.id,
        status: 'RIDE_OPEN',           // guard: must still be OPEN
        selectedOfferId: null,          // guard: no one selected yet
        requesterId: session.userId,    // guard: must be the requester
      },
      data: {
        status: 'RIDE_SELECTED',
        selectedOfferId: offerId,
        selectedAt: new Date(),
        confirmDeadline,
      },
    })

    if (result.count === 0) {
      log.warn('Select offer race condition — ride already updated', {
        route: `/api/rides/${params.id}/select`,
        userId: session.userId,
        offerId,
      })
      return NextResponse.json({ error: 'الطلب لم يعد مفتوحاً أو تم اختيار عرض آخر', shouldRefresh: true }, { status: 409 })
    }

    // Mark selected offer as ACCEPTED, others as PASSED
    await db.rideOffer.update({
      where: { id: offerId },
      data: { status: 'OFFER_ACCEPTED' },
    })

    const passedOffers = await db.rideOffer.findMany({
      where: { rideRequestId: params.id, id: { not: offerId }, status: 'OFFER_PENDING' },
      select: { id: true, driverId: true },
    })

    if (passedOffers.length > 0) {
      await db.rideOffer.updateMany({
        where: { rideRequestId: params.id, id: { not: offerId }, status: 'OFFER_PENDING' },
        data: { status: 'OFFER_PASSED' },
      })
    }

    // ── Events & Notifications (non-blocking — don't fail the request) ──────────
    try {
      await logRideEvent({
        rideRequestId: params.id,
        eventType: 'OFFER_SELECTED',
        actorType: 'requester',
        actorId: session.userId,
        metadata: { offerId, driverId: offer.driverId, confirmDeadline: confirmDeadline.toISOString() },
      })

      if (passedOffers.length > 0) {
        await logRideEvent({
          rideRequestId: params.id,
          eventType: 'OFFERS_PASSED',
          actorType: 'system',
          metadata: { passedOfferIds: passedOffers.map(o => o.id) },
        })
      }

      await notifyDriverSelected(offer.driverId, session.userId, params.id)
      await notifyOffersPassed(passedOffers.map(o => o.driverId), params.id)

    } catch (notifError) {
      // Don't fail the selection because of notification errors
      log.error('Failed to send selection notifications', notifError, {
        route: `/api/rides/${params.id}/select`,
        userId: session.userId,
      })
    }

    log.info('Offer selected successfully', {
      route: `/api/rides/${params.id}/select`,
      userId: session.userId,
      offerId,
      driverId: offer.driverId,
    })

    return NextResponse.json({
      status: 'RIDE_SELECTED',
      confirmDeadline: confirmDeadline.toISOString(),
    })
  } catch (error) {
    log.error('Select offer failed', error, { route: `/api/rides/${params.id}/select` })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

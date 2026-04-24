import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { log } from '@/lib/logger'
import { logRideEvent } from '@/lib/rides/events'
import { notifyRide } from '@/lib/rides/notify'

/**
 * POST /api/rides/[id]/reject-offer
 *
 * Requester rejects a single offer on their ride without picking
 * anyone else. The ride stays RIDE_OPEN and keeps accepting other
 * offers. Useful when a requester wants to dismiss an obviously
 * wrong offer (price way off, driver they don't want) without
 * forcing them to hit "select" on something else just to clear it.
 *
 * Body: { offerId: string }
 *
 * Only the requester of this ride can reject its offers. Only
 * OFFER_PENDING offers are rejectable — once something is accepted
 * the formal cancel flow is required.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', `/api/rides/${params.id}/reject-offer`, session.userId)

    const body = (await req.json().catch(() => null)) as { offerId?: string } | null
    const offerId = body?.offerId
    if (!offerId) return NextResponse.json({ error: 'offerId required' }, { status: 400 })

    // Caller must be the requester on this ride.
    const ride = await db.rideRequest.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, requesterId: true },
    })
    if (!ride) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ride.requesterId !== session.userId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    // Can only reject while still accepting offers. If the requester
    // already selected someone, they must cancel via the formal flow.
    if (ride.status !== 'RIDE_OPEN') {
      return NextResponse.json(
        {
          error: 'OFFER_NOT_REJECTABLE',
          message: 'لا يمكن رفض العروض بعد بدء التنسيق',
          messageEn: 'Cannot reject offers after coordination started',
          shouldRefresh: true,
          currentStatus: ride.status,
        },
        { status: 409 },
      )
    }

    const offer = await db.rideOffer.findUnique({
      where: { id: offerId },
      select: { id: true, rideRequestId: true, driverId: true, status: true, price: true },
    })
    if (!offer || offer.rideRequestId !== params.id) {
      return NextResponse.json({ error: 'العرض غير موجود' }, { status: 404 })
    }
    if (offer.status !== 'OFFER_PENDING') {
      return NextResponse.json(
        { error: 'العرض لم يعد متاحاً', shouldRefresh: true },
        { status: 409 },
      )
    }

    await db.rideOffer.update({
      where: { id: offer.id },
      data: { status: 'OFFER_PASSED' },
    })

    await logRideEvent({
      rideRequestId: ride.id,
      eventType: 'OFFER_REJECTED',
      actorType: 'requester',
      actorId: session.userId,
      metadata: { offerId: offer.id, driverId: offer.driverId, price: offer.price },
    })

    // Notify the driver — same helper the other ride touchpoints use.
    try {
      await notifyRide({
        userId: offer.driverId,
        type: 'RIDE_STATUS',
        titleAr: '🙏 شكراً على العرض',
        titleEn: '🙏 Thanks for offering',
        bodyAr: 'صاحب الطلب اختار طريقاً آخر — عروضك على طلبات أخرى لا تزال نشطة',
        bodyEn: 'The requester went another way — your offers on other rides stay active',
        actorId: session.userId,
        rideRequestId: ride.id,
      })
    } catch { /* non-fatal */ }

    log.info('Offer rejected', {
      route: `/api/rides/${params.id}/reject-offer`,
      requesterId: session.userId,
      offerId: offer.id,
      driverId: offer.driverId,
    })

    return NextResponse.json({ ok: true, id: offer.id })
  } catch (error) {
    log.error('Reject offer failed', error, { route: `/api/rides/${params.id}/reject-offer` })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

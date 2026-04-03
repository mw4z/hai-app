import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { logRideEvent } from '@/lib/rides/events'
import { notifyRequesterStatus } from '@/lib/rides/notify'
import { log } from '@/lib/logger'

/** POST — Driver confirms selection (creates Trip, atomic) */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', '/api/rides/[id]/confirm', session.userId)

    // Load ride with selected offer
    const ride = await db.rideRequest.findUnique({
      where: { id: params.id },
      select: {
        id: true, status: true, requesterId: true,
        selectedOfferId: true, confirmDeadline: true,
        offers: { where: { status: 'OFFER_ACCEPTED' }, select: { id: true, driverId: true, price: true } },
      },
    })

    if (!ride) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Verify caller is the selected driver
    const acceptedOffer = ride.offers[0]
    if (!acceptedOffer || acceptedOffer.driverId !== session.userId) {
      return NextResponse.json({ error: 'أنت لست الشخص المختار' }, { status: 403 })
    }

    // Check deadline hasn't passed
    if (ride.confirmDeadline && new Date() > ride.confirmDeadline) {
      return NextResponse.json({ error: 'انتهت مهلة التأكيد' }, { status: 409 })
    }

    // ── Atomic transition: SELECTED → CONFIRMED ─────────────────────────────────
    const result = await db.rideRequest.updateMany({
      where: {
        id: params.id,
        status: 'RIDE_SELECTED',
        selectedOfferId: acceptedOffer.id,
        confirmDeadline: { gt: new Date() },
      },
      data: {
        status: 'RIDE_CONFIRMED',
        confirmDeadline: null,
      },
    })

    if (result.count === 0) {
      return NextResponse.json({ error: 'لم يعد بالإمكان التأكيد' }, { status: 409 })
    }

    // ── Create Trip ─────────────────────────────────────────────────────────────
    const trip = await db.trip.create({
      data: {
        rideRequestId: ride.id,
        requesterId: ride.requesterId,
        driverId: session.userId,
        agreedPrice: acceptedOffer.price,
      },
    })

    // ── Events + notifications ──────────────────────────────────────────────────
    await logRideEvent({
      rideRequestId: ride.id,
      tripId: trip.id,
      eventType: 'DRIVER_CONFIRMED',
      actorType: 'driver',
      actorId: session.userId,
      metadata: { tripId: trip.id, agreedPrice: acceptedOffer.price },
    })

    await notifyRequesterStatus(
      ride.requesterId, session.userId, ride.id,
      'تم التأكيد', 'Confirmed',
      'الشخص وافق وسيكون في الطريق قريباً', 'Person accepted and will be on the way soon',
    )

    return NextResponse.json({
      status: 'RIDE_CONFIRMED',
      trip: {
        id: trip.id,
        agreedPrice: trip.agreedPrice,
        confirmedAt: trip.confirmedAt,
      },
    })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/rides/[id]/confirm' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

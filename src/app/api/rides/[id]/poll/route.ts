import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { logRideEvent } from '@/lib/rides/events'
import { notifyConfirmTimeout, notifyTripCompleted } from '@/lib/rides/notify'
import { addReputation } from '@/lib/reputation'
import { getCompletionRewards } from '@/lib/rides/state-machine'

/**
 * GET — Lightweight polling endpoint for active rides.
 * Also checks and fires timeouts inline so they work without an external cron.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ride = await db.rideRequest.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      requesterId: true,
      selectedOfferId: true,
      confirmDeadline: true,
      expiresAt: true,
      isImmediate: true,
      scheduledAt: true,
      _count: { select: { offers: true } },
      trip: {
        select: {
          id: true,
          driverId: true,
          confirmedAt: true,
          enRouteAt: true,
          arrivedAt: true,
          startedAt: true,
          driverMarkedDoneAt: true,
          completedAt: true,
          completionMode: true,
          cancelledAt: true,
        },
      },
    },
  })

  if (!ride) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date()

  // ── Inline timeout checks (fires on poll, no cron needed) ─────────────────

  // 1. SELECTED confirm timeout (5 min)
  if (ride.status === 'RIDE_SELECTED' && ride.confirmDeadline && new Date(ride.confirmDeadline) < now) {
    await db.rideRequest.update({
      where: { id: ride.id },
      data: { status: 'RIDE_OPEN', selectedOfferId: null, selectedAt: null, confirmDeadline: null },
    })
    let timedOutDriverId: string | null = null
    if (ride.selectedOfferId) {
      const timedOutOffer = await db.rideOffer.update({ where: { id: ride.selectedOfferId }, data: { status: 'OFFER_PASSED' } })
      timedOutDriverId = timedOutOffer.driverId
    }
    await logRideEvent({ rideRequestId: ride.id, eventType: 'TIMEOUT_REOPEN', actorType: 'system', metadata: { previousOfferId: ride.selectedOfferId } })
    await notifyConfirmTimeout(ride.requesterId, ride.id)
    // Notify the driver their deadline expired
    if (timedOutDriverId) {
      await db.notification.create({
        data: {
          userId: timedOutDriverId, type: 'RIDE_STATUS', actorId: 'system',
          title: 'انتهت مهلة التأكيد', titleEn: 'Confirmation deadline expired',
          body: 'لم تؤكد في الوقت المحدد — الطلب مفتوح مجدداً', bodyEn: 'You did not confirm in time — request reopened',
          rideRequestId: ride.id,
        },
      })
    }

    // Return updated status
    const updated = await db.rideRequest.findUnique({ where: { id: ride.id }, select: { _count: { select: { offers: true } } } })
    return NextResponse.json({
      status: 'RIDE_OPEN',
      offerCount: updated?._count.offers || 0,
      confirmDeadline: null,
      isLate: false,
      autoCloseAt: null,
      trip: null,
      lastMessageAt: null,
    })
  }

  // 2. ARRIVED no-show timeout (10 min)
  if (ride.status === 'RIDE_ARRIVED' && ride.trip?.arrivedAt && !ride.trip.startedAt && !ride.trip.cancelledAt) {
    const elapsed = now.getTime() - new Date(ride.trip.arrivedAt).getTime()
    if (elapsed > 10 * 60 * 1000) {
      await db.rideRequest.update({ where: { id: ride.id }, data: { status: 'RIDE_CANCELLED' } })
      await db.trip.update({ where: { id: ride.trip.id }, data: { cancelledAt: now, cancelledBy: 'system', cancelReason: 'requester no-show (10min)' } })
      await addReputation({ userId: ride.requesterId, action: 'ride_noshow', points: -5 })
      await logRideEvent({ rideRequestId: ride.id, tripId: ride.trip.id, eventType: 'NOSHOW_CANCEL', actorType: 'system' })
    }
  }

  // 3. PENDING_COMPLETION auto-close (15 min)
  if (ride.status === 'RIDE_PENDING_COMPLETION' && ride.trip?.driverMarkedDoneAt && !ride.trip.completedAt && !ride.trip.cancelledAt) {
    const elapsed = now.getTime() - new Date(ride.trip.driverMarkedDoneAt).getTime()
    if (elapsed > 15 * 60 * 1000) {
      const rewards = getCompletionRewards('AUTO_CLOSED')
      await db.rideRequest.update({ where: { id: ride.id }, data: { status: 'RIDE_COMPLETED' } })
      await db.trip.update({ where: { id: ride.trip.id }, data: { completedAt: now, completionMode: 'AUTO_CLOSED' } })
      await addReputation({ userId: ride.trip.driverId, action: 'ride_completed', points: rewards.driverRep, fromUserId: ride.requesterId })
      await db.user.update({ where: { id: ride.trip.driverId }, data: { driverTripsCount: { increment: 1 } } })
      await logRideEvent({ rideRequestId: ride.id, tripId: ride.trip.id, eventType: 'AUTO_COMPLETED', actorType: 'system' })
      await notifyTripCompleted(ride.requesterId, ride.trip.driverId, ride.id)
    }
  }

  // 4. OPEN expiry
  if (ride.status === 'RIDE_OPEN' && new Date(ride.expiresAt) < now) {
    await db.rideRequest.update({ where: { id: ride.id }, data: { status: 'RIDE_EXPIRED' } })
    await db.rideOffer.updateMany({ where: { rideRequestId: ride.id, status: 'OFFER_PENDING' }, data: { status: 'OFFER_PASSED' } })
    await logRideEvent({ rideRequestId: ride.id, eventType: 'EXPIRED', actorType: 'system' })
  }

  // ── Re-read after potential changes ───────────────────────────────────────

  const fresh = await db.rideRequest.findUnique({
    where: { id: params.id },
    select: {
      status: true, confirmDeadline: true, isImmediate: true, scheduledAt: true,
      _count: { select: { offers: true } },
      trip: {
        select: {
          confirmedAt: true, enRouteAt: true, arrivedAt: true, startedAt: true,
          driverMarkedDoneAt: true, completedAt: true, completionMode: true, cancelledAt: true,
        },
      },
    },
  })
  if (!fresh) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const lastMessage = await db.rideMessage.findFirst({
    where: { rideRequestId: params.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  // Caller's own offer status — lets a driver's UI react in real time
  // when the requester rejects (or withdraws) their offer, instead of
  // requiring a manual refresh. null when the caller is the requester
  // or hasn't offered.
  const myOffer = await db.rideOffer.findUnique({
    where: { rideRequestId_driverId: { rideRequestId: params.id, driverId: session.userId } },
    select: { status: true },
  })

  const isLate = !fresh.isImmediate && fresh.scheduledAt && new Date(fresh.scheduledAt) < now && fresh.status === 'RIDE_OPEN'
  const autoCloseAt = fresh.status === 'RIDE_PENDING_COMPLETION' && fresh.trip?.driverMarkedDoneAt
    ? new Date(new Date(fresh.trip.driverMarkedDoneAt).getTime() + 15 * 60 * 1000).toISOString()
    : null

  return NextResponse.json({
    status: fresh.status,
    offerCount: fresh._count.offers,
    confirmDeadline: fresh.confirmDeadline,
    isLate: isLate || false,
    autoCloseAt,
    trip: fresh.trip,
    lastMessageAt: lastMessage?.createdAt || null,
    myOfferStatus: myOffer?.status ?? null,
  })
}

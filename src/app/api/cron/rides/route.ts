import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logRideEvent } from '@/lib/rides/events'
import { notifyConfirmTimeout, notifyTripCompleted, notifyRequesterStatus } from '@/lib/rides/notify'
import { addReputation } from '@/lib/reputation'
import { getCompletionRewards, getStaleInProgressTimeout } from '@/lib/rides/state-machine'

const CRON_SECRET = process.env.CRON_SECRET || 'hai-cron-dev-key'

/**
 * GET /api/cron/rides?key=SECRET
 *
 * Runs every 60 seconds. 7 timeout jobs in strict order:
 * 1. SELECTED confirm timeout (5 min)
 * 2. CONFIRMED stale (20 min)
 * 3. EN_ROUTE stale (45 min)
 * 4. ARRIVED no-show (10 min)
 * 5. IN_PROGRESS stale (3 hr) → DISPUTED
 * 6. PENDING_COMPLETION auto-close (15 min)
 * 7. OPEN expiry (2hr immediate / scheduledAt+15min scheduled)
 */
export async function GET(req: NextRequest) {
  // Vercel Cron sends this header; accept it as auth so the scheduled
  // job runs without having to leak CRON_SECRET into vercel.json.
  const isVercelCron = req.headers.get('x-vercel-cron') != null
  const { searchParams } = new URL(req.url)
  if (!isVercelCron && searchParams.get('key') !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  let processed = 0

  // ── 1. SELECTED confirm timeout (5 min) ─────────────────────────────────────

  const expiredSelections = await db.rideRequest.findMany({
    where: { status: 'RIDE_SELECTED', confirmDeadline: { lt: now } },
    select: { id: true, requesterId: true, selectedOfferId: true, type: true },
  })

  for (const ride of expiredSelections) {
    await db.rideRequest.update({
      where: { id: ride.id },
      data: { status: 'RIDE_OPEN', selectedOfferId: null, selectedAt: null, confirmDeadline: null },
    })
    if (ride.selectedOfferId) {
      await db.rideOffer.update({ where: { id: ride.selectedOfferId }, data: { status: 'OFFER_PASSED' } })
    }
    await logRideEvent({
      rideRequestId: ride.id, eventType: 'TIMEOUT_REOPEN', actorType: 'system',
      metadata: { previousOfferId: ride.selectedOfferId, timeoutMin: 5 },
    })
    await notifyConfirmTimeout(ride.requesterId, ride.id, ride.type as 'RIDE' | 'DELIVERY')
    processed++
  }

  // ── 2. CONFIRMED stale (20 min) ─────────────────────────────────────────────

  const staleConfirmed = await db.trip.findMany({
    where: {
      enRouteAt: null, cancelledAt: null,
      confirmedAt: { lt: new Date(now.getTime() - 20 * 60 * 1000) },
      rideRequest: { status: 'RIDE_CONFIRMED' },
    },
    select: { id: true, rideRequestId: true, requesterId: true, driverId: true },
  })

  for (const trip of staleConfirmed) {
    await db.rideRequest.update({ where: { id: trip.rideRequestId }, data: { status: 'RIDE_CANCELLED' } })
    await db.trip.update({ where: { id: trip.id }, data: { cancelledAt: now, cancelledBy: 'system', cancelReason: 'driver stale at CONFIRMED (20min)' } })
    await addReputation({ userId: trip.driverId, action: 'ride_cancel', points: -5 })
    await db.user.update({ where: { id: trip.driverId }, data: { driverCancelCount: { increment: 1 } } })
    await logRideEvent({
      rideRequestId: trip.rideRequestId, tripId: trip.id,
      eventType: 'STALE_CANCEL', actorType: 'system',
      metadata: { staleState: 'CONFIRMED', timeoutMin: 20 },
    })
    await notifyRequesterStatus(trip.requesterId, 'system', trip.rideRequestId,
      'لم يبدأ المشوار', 'Did not start',
      'تم الإلغاء — يمكنك إنشاء طلب جديد', 'Trip cancelled — you can create a new request',
    )
    processed++
  }

  // ── 3. EN_ROUTE stale (45 min, flagged suspicious) ──────────────────────────

  const staleEnRoute = await db.trip.findMany({
    where: {
      arrivedAt: null, cancelledAt: null,
      enRouteAt: { not: null, lt: new Date(now.getTime() - 45 * 60 * 1000) },
      rideRequest: { status: 'RIDE_EN_ROUTE' },
    },
    select: { id: true, rideRequestId: true, requesterId: true, driverId: true, enRouteAt: true },
  })

  for (const trip of staleEnRoute) {
    await db.rideRequest.update({ where: { id: trip.rideRequestId }, data: { status: 'RIDE_CANCELLED' } })
    await db.trip.update({ where: { id: trip.id }, data: { cancelledAt: now, cancelledBy: 'system', cancelReason: 'driver stale at EN_ROUTE (45min), flagged suspicious' } })
    await addReputation({ userId: trip.driverId, action: 'ride_cancel', points: -10 })
    await db.user.update({ where: { id: trip.driverId }, data: { driverCancelCount: { increment: 1 } } })
    await logRideEvent({
      rideRequestId: trip.rideRequestId, tripId: trip.id,
      eventType: 'STALE_CANCEL', actorType: 'system',
      metadata: { staleState: 'EN_ROUTE', timeoutMin: 45, suspicious: true, enRouteAt: trip.enRouteAt },
    })
    await notifyRequesterStatus(trip.requesterId, 'system', trip.rideRequestId,
      'لم يصل', 'Did not arrive',
      'تم الإلغاء — يمكنك إنشاء طلب جديد', 'Trip cancelled — you can create a new request',
    )
    processed++
  }

  // ── 4. ARRIVED no-show (10 min) ─────────────────────────────────────────────

  const noshowTrips = await db.trip.findMany({
    where: {
      arrivedAt: { lt: new Date(now.getTime() - 10 * 60 * 1000) },
      startedAt: null, cancelledAt: null, completedAt: null,
      rideRequest: { status: 'RIDE_ARRIVED' },
    },
    select: { id: true, rideRequestId: true, requesterId: true, driverId: true, arrivedAt: true },
  })

  for (const trip of noshowTrips) {
    await db.rideRequest.update({ where: { id: trip.rideRequestId }, data: { status: 'RIDE_CANCELLED' } })
    await db.trip.update({ where: { id: trip.id }, data: { cancelledAt: now, cancelledBy: 'system', cancelReason: 'requester no-show (10min)' } })
    await addReputation({ userId: trip.requesterId, action: 'ride_noshow', points: -5 })
    await logRideEvent({
      rideRequestId: trip.rideRequestId, tripId: trip.id,
      eventType: 'NOSHOW_CANCEL', actorType: 'system',
      metadata: { arrivedAt: trip.arrivedAt, elapsedMin: 10 },
    })
    processed++
  }

  // ── 5. IN_PROGRESS stale (3 hr) → DISPUTED ─────────────────────────────────
  // Structured for future duration-awareness via getStaleInProgressTimeout()

  const staleTimeoutMs = getStaleInProgressTimeout()
  const staleInProgress = await db.trip.findMany({
    where: {
      startedAt: { lt: new Date(now.getTime() - staleTimeoutMs) },
      driverMarkedDoneAt: null, completedAt: null, cancelledAt: null,
      rideRequest: { status: 'RIDE_IN_PROGRESS' },
    },
    select: { id: true, rideRequestId: true, requesterId: true, driverId: true, startedAt: true },
  })

  for (const trip of staleInProgress) {
    await db.rideRequest.update({ where: { id: trip.rideRequestId }, data: { status: 'RIDE_DISPUTED' } })
    await db.rideDispute.create({
      data: { tripId: trip.id, openedBy: 'system', reason: `Trip stale: started ${Math.round(staleTimeoutMs / 60000)}min ago, no completion signal`, status: 'open' },
    })
    await logRideEvent({
      rideRequestId: trip.rideRequestId, tripId: trip.id,
      eventType: 'STALE_DISPUTED', actorType: 'system',
      metadata: { staleState: 'IN_PROGRESS', startedAt: trip.startedAt, elapsedMs: staleTimeoutMs },
    })
    await notifyRequesterStatus(trip.requesterId, 'system', trip.rideRequestId,
      'المشوار بحاجة مراجعة', 'Trip needs review',
      'تم تحويل المشوار للمراجعة لعدم اكتماله', 'Trip moved to review due to no completion',
    )
    await notifyRequesterStatus(trip.driverId, 'system', trip.rideRequestId,
      'المشوار بحاجة مراجعة', 'Trip needs review',
      'تم تحويل المشوار للمراجعة لعدم اكتماله', 'Trip moved to review due to no completion',
    )
    processed++
  }

  // ── 6. PENDING_COMPLETION auto-close (15 min) ───────────────────────────────

  const autoCompleteTrips = await db.trip.findMany({
    where: {
      driverMarkedDoneAt: { lt: new Date(now.getTime() - 15 * 60 * 1000) },
      completedAt: null, cancelledAt: null,
      rideRequest: { status: 'RIDE_PENDING_COMPLETION' },
    },
    select: {
      id: true, rideRequestId: true, requesterId: true, driverId: true, driverMarkedDoneAt: true,
      rideRequest: { select: { type: true } },
    },
  })

  for (const trip of autoCompleteTrips) {
    const rewards = getCompletionRewards('AUTO_CLOSED')

    await db.rideRequest.update({ where: { id: trip.rideRequestId }, data: { status: 'RIDE_COMPLETED' } })
    await db.trip.update({
      where: { id: trip.id },
      data: { completedAt: now, completionMode: 'AUTO_CLOSED' },
    })

    await addReputation({ userId: trip.driverId, action: 'ride_completed', points: rewards.driverRep, fromUserId: trip.requesterId })
    if (rewards.requesterRep > 0) {
      await addReputation({ userId: trip.requesterId, action: 'ride_completed', points: rewards.requesterRep, fromUserId: trip.driverId })
    }
    await db.user.update({ where: { id: trip.driverId }, data: { driverTripsCount: { increment: 1 } } })

    await logRideEvent({
      rideRequestId: trip.rideRequestId, tripId: trip.id,
      eventType: 'AUTO_COMPLETED', actorType: 'system',
      metadata: {
        driverMarkedDoneAt: trip.driverMarkedDoneAt,
        completionMode: 'AUTO_CLOSED',
        driverRep: rewards.driverRep,
        requesterRep: rewards.requesterRep,
        ratingWeight: rewards.ratingWeight,
        elapsed: '15min',
      },
    })

    await notifyTripCompleted(trip.requesterId, trip.driverId, trip.rideRequestId, trip.rideRequest?.type as 'RIDE' | 'DELIVERY')
    processed++
  }

  // ── 7. OPEN expiry ──────────────────────────────────────────────────────────

  const expiredRides = await db.rideRequest.findMany({
    where: { status: 'RIDE_OPEN', expiresAt: { lt: now } },
    select: { id: true, requesterId: true, isImmediate: true, scheduledAt: true },
  })

  for (const ride of expiredRides) {
    // Determine if this is a late scheduled ride (past scheduledAt but in grace window)
    // At this point expiresAt has passed, so it's truly expired
    const isLateExpiry = !ride.isImmediate && ride.scheduledAt && ride.scheduledAt < now

    await db.rideRequest.update({ where: { id: ride.id }, data: { status: 'RIDE_EXPIRED' } })
    await db.rideOffer.updateMany({
      where: { rideRequestId: ride.id, status: 'OFFER_PENDING' },
      data: { status: 'OFFER_PASSED' },
    })
    await logRideEvent({
      rideRequestId: ride.id, eventType: 'EXPIRED', actorType: 'system',
      metadata: { isLateExpiry },
    })
    await db.notification.create({
      data: {
        userId: ride.requesterId, type: 'RIDE_STATUS', actorId: 'system',
        title: 'انتهت صلاحية طلبك', titleEn: 'Your ride request expired',
        body: 'يمكنك إنشاء طلب جديد', bodyEn: 'You can create a new request',
        rideRequestId: ride.id,
      },
    })
    processed++
  }

  return NextResponse.json({ processed, timestamp: now.toISOString() })
}

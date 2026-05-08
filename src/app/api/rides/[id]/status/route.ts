import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canTransition, getActorRole, getCancelPenalty, getCompletionRewards } from '@/lib/rides/state-machine'
import type { RideStatus } from '@/lib/rides/state-machine'
import { logRideEvent, logInvalidTransition } from '@/lib/rides/events'
import { notifyRequesterStatus, notifyTripCompleted } from '@/lib/rides/notify'
import { cleanupNotificationsFor, sendCleanupPush } from '@/lib/notifications'
import { addReputation } from '@/lib/reputation'
import { log } from '@/lib/logger'

type Action = 'en_route' | 'arrived' | 'start' | 'mark_done' | 'complete' | 'cancel' | 'dispute' | 'withdraw_dispute'

/** Structured error response */
function rideError(code: string, messageAr: string, messageEn: string, status: number, currentStatus?: string) {
  return NextResponse.json({
    error: code,
    message: messageAr,
    messageEn,
    shouldRefresh: ['RIDE_NOT_OPEN', 'RIDE_ALREADY_SELECTED', 'CONFIRM_DEADLINE_PASSED', 'RIDE_REOPENED', 'INVALID_TRANSITION', 'TIMESTAMP_ALREADY_SET', 'OFFER_NOT_EDITABLE'].includes(code),
    currentStatus,
  }, { status })
}

/** POST — Update trip status */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', '/api/rides/[id]/status', session.userId)

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
    const action = body.action as Action
    const reason = body.reason as string | undefined

    if (!action || !['en_route', 'arrived', 'start', 'mark_done', 'complete', 'cancel', 'dispute', 'withdraw_dispute'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const ride = await db.rideRequest.findUnique({
      where: { id: params.id },
      include: { trip: true },
    })
    if (!ride) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { role: true },
    })

    const currentStatus = ride.status as RideStatus
    const driverId = ride.trip?.driverId || null
    const actorRole = getActorRole(session.userId, ride.requesterId, driverId, user?.role)

    console.log(`[RIDE_STATUS] action=${action}, status=${currentStatus}, userId=${session.userId}, requesterId=${ride.requesterId}, driverId=${driverId}, actorRole=${actorRole}`)

    // ── mark_done: IN_PROGRESS → PENDING_COMPLETION ─────────────────────────────
    if (action === 'mark_done') {
      const check = canTransition(currentStatus, 'RIDE_PENDING_COMPLETION', actorRole)
      if (!check.valid) {
        await logInvalidTransition(ride.id, session.userId, actorRole, currentStatus, 'RIDE_PENDING_COMPLETION', check.error!)
        return rideError(check.errorCode || 'INVALID_TRANSITION', 'لا يمكن تنفيذ هذا الإجراء الآن', 'Cannot perform this action now', 409, currentStatus)
      }
      if (ride.trip?.driverMarkedDoneAt) {
        return rideError('TIMESTAMP_ALREADY_SET', 'تم تسجيل هذه المرحلة مسبقاً', 'This phase was already recorded', 409, currentStatus)
      }

      await db.rideRequest.update({ where: { id: ride.id }, data: { status: 'RIDE_PENDING_COMPLETION' } })
      await db.trip.update({
        where: { id: ride.trip!.id },
        data: { driverMarkedDoneAt: new Date() },
      })

      const autoCloseAt = new Date(Date.now() + 15 * 60 * 1000)

      await logRideEvent({
        rideRequestId: ride.id,
        tripId: ride.trip!.id,
        eventType: 'DRIVER_MARKED_DONE',
        actorType: 'driver',
        actorId: session.userId,
        metadata: { autoCloseAt: autoCloseAt.toISOString() },
      })

      // Notify requester to confirm
      await notifyRequesterStatus(
        ride.requesterId, session.userId, ride.id,
        'يقول وصلتم', 'Says you arrived',
        'أكّد الوصول أو سيتم الإغلاق تلقائياً خلال 15 دقيقة', 'Confirm arrival or auto-close in 15 minutes',
      )
      // Notify driver their mark_done was recorded
      await notifyRequesterStatus(
        session.userId, ride.requesterId, ride.id,
        'تم تسجيل الوصول', 'Arrival marked',
        'بانتظار تأكيد الراكب', 'Waiting for requester confirmation',
      )

      return NextResponse.json({ status: 'RIDE_PENDING_COMPLETION', autoCloseAt: autoCloseAt.toISOString() })
    }

    // ── complete: PENDING_COMPLETION → COMPLETED ────────────────────────────────
    if (action === 'complete') {
      const check = canTransition(currentStatus, 'RIDE_COMPLETED', actorRole)
      if (!check.valid) {
        await logInvalidTransition(ride.id, session.userId, actorRole, currentStatus, 'RIDE_COMPLETED', check.error!)
        return rideError(check.errorCode || 'INVALID_TRANSITION', 'لا يمكن تنفيذ هذا الإجراء الآن', 'Cannot perform this action now', 409, currentStatus)
      }

      await db.rideRequest.update({ where: { id: ride.id }, data: { status: 'RIDE_COMPLETED' } })
      await db.trip.update({
        where: { id: ride.trip!.id },
        data: {
          requesterConfirmedDoneAt: new Date(),
          completedAt: new Date(),
          completionMode: 'REQUESTER_CONFIRMED',
        },
      })

      const rewards = getCompletionRewards('REQUESTER_CONFIRMED')
      await addReputation({ userId: driverId!, action: 'ride_completed', points: rewards.driverRep, fromUserId: ride.requesterId, postId: ride.id })
      await addReputation({ userId: ride.requesterId, action: 'ride_completed', points: rewards.requesterRep, fromUserId: driverId!, postId: ride.id })
      await db.user.update({ where: { id: driverId! }, data: { driverTripsCount: { increment: 1 } } })

      await logRideEvent({
        rideRequestId: ride.id,
        tripId: ride.trip!.id,
        eventType: 'REQUESTER_CONFIRMED_DONE',
        actorType: 'requester',
        actorId: session.userId,
        metadata: { completionMode: 'REQUESTER_CONFIRMED', driverRep: rewards.driverRep, requesterRep: rewards.requesterRep },
      })

      await notifyTripCompleted(ride.requesterId, driverId!, ride.id, ride.type as 'RIDE' | 'DELIVERY')

      return NextResponse.json({ status: 'RIDE_COMPLETED', completionMode: 'REQUESTER_CONFIRMED' })
    }

    // ── cancel ──────────────────────────────────────────────────────────────────
    if (action === 'cancel') {
      const check = canTransition(currentStatus, 'RIDE_CANCELLED', actorRole)
      if (!check.valid) {
        await logInvalidTransition(ride.id, session.userId, actorRole, currentStatus, 'RIDE_CANCELLED', check.error!)
        return rideError(check.errorCode || 'INVALID_TRANSITION', 'لا يمكن الإلغاء الآن', 'Cannot cancel now', 409, currentStatus)
      }

      if (!reason && !['RIDE_OPEN', 'RIDE_SELECTED'].includes(currentStatus)) {
        return NextResponse.json({ error: 'سبب الإلغاء مطلوب', messageEn: 'Cancel reason required' }, { status: 400 })
      }

      await db.rideRequest.update({ where: { id: ride.id }, data: { status: 'RIDE_CANCELLED' } })

      if (ride.trip) {
        await db.trip.update({
          where: { id: ride.trip.id },
          data: { cancelledAt: new Date(), cancelledBy: session.userId, cancelReason: reason?.slice(0, 200) || null },
        })
      }

      const penalty = getCancelPenalty(currentStatus)
      if (penalty !== 0) {
        await addReputation({ userId: session.userId, action: 'ride_cancel', points: penalty })
      }
      if (actorRole === 'driver' && ride.trip) {
        await db.user.update({ where: { id: session.userId }, data: { driverCancelCount: { increment: 1 } } })
      }

      await logRideEvent({
        rideRequestId: ride.id,
        tripId: ride.trip?.id,
        eventType: 'CANCELLED',
        actorType: actorRole,
        actorId: session.userId,
        metadata: { fromStatus: currentStatus, reason, penaltyApplied: penalty },
      })

      // Notify other party
      const otherPartyId = actorRole === 'requester' ? driverId : ride.requesterId
      if (otherPartyId) {
        await notifyRequesterStatus(
          otherPartyId, session.userId, ride.id,
          'تم إلغاء الرحلة', 'Ride cancelled',
          reason || 'تم الإلغاء', reason || 'Cancelled',
        )
      }

      // Clear in-ride notifications (RIDE_MESSAGE bell rows + OS-level
      // banners) for both parties — the ride is dead, those entries
      // tap-jump nowhere useful. Awaited so the API response only
      // resolves after cleanup commits and the client's tray-sweep
      // sees the post-cancel state.
      await cleanupNotificationsFor({ rideRequestId: ride.id })
        .catch(() => { /* non-fatal */ })

      // cleanupNotificationsFor only fires the silent push for users
      // who had a Notification bell row — rides without any in-trip
      // chat have none, but the requester/driver may still have an
      // OS banner from new_ride_request or ride_status pushes. Nudge
      // them explicitly so those banners clear too.
      const explicitRecipients = [ride.requesterId, ...(driverId ? [driverId] : [])]
      void sendCleanupPush(explicitRecipients, {
        contentType: 'rideRequest', contentId: ride.id,
      }).catch(() => { /* best effort */ })

      return NextResponse.json({ status: 'RIDE_CANCELLED' })
    }

    // ── dispute ─────────────────────────────────────────────────────────────────
    if (action === 'dispute') {
      if (!reason || reason.length < 10) {
        return NextResponse.json({ error: 'اشرح سبب النزاع (10 أحرف على الأقل)', messageEn: 'Explain dispute reason (10+ chars)' }, { status: 400 })
      }

      // Special case: dispute from COMPLETED (auto-close grace window)
      if (currentStatus === 'RIDE_COMPLETED' as RideStatus) {
        if (ride.trip?.completionMode !== 'AUTO_CLOSED') {
          return rideError('INVALID_TRANSITION', 'لا يمكن فتح نزاع على رحلة مؤكدة', 'Cannot dispute a confirmed trip', 409, currentStatus)
        }
        // Check 24hr grace window
        const completedAt = ride.trip?.completedAt
        if (!completedAt || Date.now() - completedAt.getTime() > 24 * 60 * 60 * 1000) {
          return rideError('RATING_WINDOW_CLOSED', 'انتهت مهلة النزاع', 'Dispute window closed', 410, currentStatus)
        }
      } else {
        const check = canTransition(currentStatus, 'RIDE_DISPUTED', actorRole)
        if (!check.valid) {
          await logInvalidTransition(ride.id, session.userId, actorRole, currentStatus, 'RIDE_DISPUTED', check.error!)
          return rideError(check.errorCode || 'INVALID_TRANSITION', 'لا يمكن فتح نزاع الآن', 'Cannot open dispute now', 409, currentStatus)
        }
      }

      await db.rideRequest.update({ where: { id: ride.id }, data: { status: 'RIDE_DISPUTED' } })

      await db.rideDispute.create({
        data: {
          tripId: ride.trip!.id,
          openedBy: session.userId,
          reason: reason.slice(0, 500),
        },
      })

      await logRideEvent({
        rideRequestId: ride.id,
        tripId: ride.trip!.id,
        eventType: 'DISPUTE_OPENED',
        actorType: actorRole,
        actorId: session.userId,
        metadata: { reason, fromStatus: currentStatus },
      })

      // Notify other party + admins
      const otherPartyId = actorRole === 'requester' ? driverId : ride.requesterId
      if (otherPartyId) {
        await notifyRequesterStatus(
          otherPartyId, session.userId, ride.id,
          'تم فتح نزاع على الرحلة', 'Dispute opened on trip',
          reason.slice(0, 100), reason.slice(0, 100),
        )
      }

      return NextResponse.json({ status: 'RIDE_DISPUTED' })
    }

    // ── withdraw_dispute: revert to previous state ──────────────────────────────
    if (action === 'withdraw_dispute') {
      if (currentStatus !== 'RIDE_DISPUTED') {
        return rideError('INVALID_TRANSITION', 'لا يوجد نزاع لسحبه', 'No dispute to withdraw', 409, currentStatus)
      }

      // Only the person who opened the dispute can withdraw it
      const dispute = await db.rideDispute.findFirst({
        where: { trip: { rideRequestId: ride.id }, status: 'open' },
      })
      if (!dispute) {
        return rideError('INVALID_TRANSITION', 'النزاع غير موجود', 'Dispute not found', 409, currentStatus)
      }

      // Determine what state to revert to based on trip timestamps
      let revertStatus: RideStatus = 'RIDE_IN_PROGRESS'
      if (ride.trip?.driverMarkedDoneAt) revertStatus = 'RIDE_PENDING_COMPLETION'

      await db.rideRequest.update({ where: { id: ride.id }, data: { status: revertStatus } })

      // Close the dispute as withdrawn
      await db.rideDispute.update({
        where: { id: dispute.id },
        data: { status: 'withdrawn', resolvedAt: new Date() },
      })

      await logRideEvent({
        rideRequestId: ride.id,
        tripId: ride.trip?.id,
        eventType: 'DISPUTE_RESOLVED',
        actorType: actorRole,
        actorId: session.userId,
        metadata: { resolution: 'withdrawn', revertedTo: revertStatus },
      })

      // Notify other party
      const otherPartyId = actorRole === 'requester' ? driverId : ride.requesterId
      if (otherPartyId) {
        await notifyRequesterStatus(
          otherPartyId, session.userId, ride.id,
          'تم سحب النزاع', 'Dispute withdrawn',
          'الرحلة عادت للحالة السابقة', 'Trip reverted to previous state',
        )
      }

      return NextResponse.json({ status: revertStatus })
    }

    // ── Driver status updates (en_route, arrived, start) ────────────────────────
    const TARGET_MAP: Record<string, RideStatus> = {
      en_route: 'RIDE_EN_ROUTE',
      arrived: 'RIDE_ARRIVED',
      start: 'RIDE_IN_PROGRESS',
    }
    const EVENT_MAP: Record<string, string> = {
      en_route: 'DRIVER_EN_ROUTE',
      arrived: 'DRIVER_ARRIVED',
      start: 'TRIP_STARTED',
    }
    const targetStatus = TARGET_MAP[action]

    const check = canTransition(currentStatus, targetStatus, actorRole)
    if (!check.valid) {
      await logInvalidTransition(ride.id, session.userId, actorRole, currentStatus, targetStatus, check.error!)
      return rideError(check.errorCode || 'INVALID_TRANSITION', 'لا يمكن تنفيذ هذا الإجراء الآن', 'Cannot perform this action now', 409, currentStatus)
    }

    // Write-once timestamp enforcement
    const TIMESTAMP_MAP: Record<string, keyof NonNullable<typeof ride.trip>> = {
      en_route: 'enRouteAt',
      arrived: 'arrivedAt',
      start: 'startedAt',
    }
    const tsField = TIMESTAMP_MAP[action]
    if (ride.trip && tsField && ride.trip[tsField] !== null) {
      return rideError('TIMESTAMP_ALREADY_SET', 'تم تسجيل هذه المرحلة مسبقاً', 'This phase was already recorded', 409, currentStatus)
    }

    await db.rideRequest.update({ where: { id: ride.id }, data: { status: targetStatus } })

    if (ride.trip) {
      await db.trip.update({
        where: { id: ride.trip.id },
        data: { [tsField]: new Date() },
      })
    }

    await logRideEvent({
      rideRequestId: ride.id,
      tripId: ride.trip?.id,
      eventType: EVENT_MAP[action] as any,
      actorType: actorRole,
      actorId: session.userId,
    })

    // Notify BOTH parties for every status change. Copy varies by
    // RideRequest type — DELIVERY couriers go to a store, pick up an
    // item, and deliver it; addressing the requester as if they're
    // about to be picked up by a driver is wrong for that flow.
    const isDelivery = ride.type === 'DELIVERY'
    const STATUS_MESSAGES_RIDE: Record<string, {
      requester: { ar: string; en: string; bodyAr: string; bodyEn: string }
      driver: { ar: string; en: string; bodyAr: string; bodyEn: string }
    }> = {
      en_route: {
        requester: { ar: 'في الطريق إليك', en: 'On the way to you', bodyAr: 'الشخص في طريقه إليك', bodyEn: 'Person is heading to you' },
        driver: { ar: 'أنت في الطريق', en: 'You are on the way', bodyAr: 'توجه لنقطة الانطلاق', bodyEn: 'Head to the pickup point' },
      },
      arrived: {
        requester: { ar: 'وصل', en: 'Arrived', bodyAr: 'الشخص عند نقطة الانطلاق', bodyEn: 'Person at pickup point' },
        driver: { ar: 'أنت عند نقطة الانطلاق', en: 'You are at pickup', bodyAr: 'بانتظار الطالب', bodyEn: 'Waiting for requester' },
      },
      start: {
        requester: { ar: 'بدأ المشوار', en: 'Ride started', bodyAr: 'في الطريق إلى الوجهة', bodyEn: 'On the way to destination' },
        driver: { ar: 'بدأ المشوار', en: 'Ride started', bodyAr: 'في الطريق إلى الوجهة', bodyEn: 'On the way to destination' },
      },
    }
    const STATUS_MESSAGES_DELIVERY: typeof STATUS_MESSAGES_RIDE = {
      en_route: {
        requester: { ar: '🛵 في الطريق للاستلام', en: '🛵 Heading to pickup', bodyAr: 'المندوب توجّه لاستلام طلبك', bodyEn: 'Courier is heading to pick up your order' },
        driver:    { ar: '🛵 أنت في الطريق للاستلام', en: '🛵 Heading to pickup', bodyAr: 'توجّه لنقطة الاستلام', bodyEn: 'Head to the pickup point' },
      },
      arrived: {
        requester: { ar: '🏬 المندوب عند نقطة الاستلام', en: '🏬 Courier at pickup', bodyAr: 'يستلم طلبك الآن', bodyEn: 'Picking up your order now' },
        driver:    { ar: '🏬 أنت عند نقطة الاستلام', en: '🏬 At pickup', bodyAr: 'استلم الطلب ثم اضغط التالي', bodyEn: 'Pick up the order then tap next' },
      },
      start: {
        requester: { ar: '📦 جاري التوصيل', en: '📦 Out for delivery', bodyAr: 'طلبك في طريقه إليك', bodyEn: 'Your order is on its way' },
        driver:    { ar: '📦 جاري التوصيل', en: '📦 Out for delivery', bodyAr: 'في الطريق لنقطة التسليم', bodyEn: 'Heading to the drop-off' },
      },
    }
    const STATUS_MESSAGES = isDelivery ? STATUS_MESSAGES_DELIVERY : STATUS_MESSAGES_RIDE

    const msg = STATUS_MESSAGES[action]
    if (msg) {
      // Notify requester
      await notifyRequesterStatus(ride.requesterId, session.userId, ride.id, msg.requester.ar, msg.requester.en, msg.requester.bodyAr, msg.requester.bodyEn)
      // Notify driver
      if (driverId && driverId !== session.userId) {
        await notifyRequesterStatus(driverId, session.userId, ride.id, msg.driver.ar, msg.driver.en, msg.driver.bodyAr, msg.driver.bodyEn)
      }
    }

    return NextResponse.json({ status: targetStatus })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/rides/[id]/status' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

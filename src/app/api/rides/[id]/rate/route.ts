import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { logRideEvent } from '@/lib/rides/events'
import { addReputation } from '@/lib/reputation'
import { getRatingWindowHours, getCompletionRewards } from '@/lib/rides/state-machine'
import { log } from '@/lib/logger'

/** POST — Rate the other party after trip completion */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', '/api/rides/[id]/rate', session.userId)

    const ride = await db.rideRequest.findUnique({
      where: { id: params.id },
      include: { trip: true },
    })

    if (!ride || !ride.trip) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ride.status !== 'RIDE_COMPLETED') {
      return NextResponse.json({
        error: 'INVALID_TRANSITION', message: 'الرحلة لم تكتمل بعد',
        messageEn: 'Trip not yet completed', shouldRefresh: true,
      }, { status: 409 })
    }

    // Completion-mode-aware rating window
    const windowHours = getRatingWindowHours(ride.trip.completionMode)
    if (ride.trip.completedAt) {
      const elapsed = Date.now() - ride.trip.completedAt.getTime()
      if (elapsed > windowHours * 3600 * 1000) {
        return NextResponse.json({
          error: 'RATING_WINDOW_CLOSED', message: 'انتهت مهلة التقييم',
          messageEn: 'Rating window closed', shouldRefresh: false,
        }, { status: 410 })
      }
    }

    // Determine role
    const isRequester = session.userId === ride.trip.requesterId
    const isDriver = session.userId === ride.trip.driverId
    if (!isRequester && !isDriver) {
      return NextResponse.json({
        error: 'NOT_PARTICIPANT', message: 'ليس لديك صلاحية',
        messageEn: 'You are not a participant', shouldRefresh: false,
      }, { status: 403 })
    }

    const role = isRequester ? 'requester_rates_driver' : 'driver_rates_requester'
    const targetId = isRequester ? ride.trip.driverId : ride.trip.requesterId

    // Check not already rated
    const existing = await db.rideRating.findUnique({
      where: { tripId_raterId: { tripId: ride.trip.id, raterId: session.userId } },
    })
    if (existing) {
      return NextResponse.json({
        error: 'ALREADY_RATED', message: 'قيّمت هذه الرحلة بالفعل',
        messageEn: 'Already rated this trip', shouldRefresh: false,
      }, { status: 409 })
    }

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
    const { score, comment } = body

    if (!score || !Number.isInteger(score) || score < 1 || score > 5) {
      return NextResponse.json({ error: 'التقييم يجب أن يكون بين 1 و5' }, { status: 400 })
    }
    if (comment && comment.length > 200) {
      return NextResponse.json({ error: 'التعليق طويل جداً' }, { status: 400 })
    }

    // Create rating
    const rating = await db.rideRating.create({
      data: {
        tripId: ride.trip.id,
        raterId: session.userId,
        targetId,
        role,
        score,
        comment: comment?.trim() || null,
      },
    })

    // Completion-mode-aware rating weight for driver average
    if (role === 'requester_rates_driver') {
      const completionMode = ride.trip.completionMode as string || 'REQUESTER_CONFIRMED'
      const mode = completionMode === 'AUTO_CLOSED' ? 'AUTO_CLOSED' : completionMode === 'REQUESTER_CONFIRMED' ? 'REQUESTER_CONFIRMED' : 'DISPUTE_RESOLVED'
      const { ratingWeight } = getCompletionRewards(mode as any)

      // Weighted average: this rating counts as ratingWeight of a full rating
      const allDriverRatings = await db.rideRating.findMany({
        where: { targetId, role: 'requester_rates_driver' },
        select: { score: true, trip: { select: { completionMode: true } } },
      })

      let weightedSum = 0
      let weightSum = 0
      for (const r of allDriverRatings) {
        const m = r.trip?.completionMode === 'AUTO_CLOSED' ? 'AUTO_CLOSED' : 'REQUESTER_CONFIRMED'
        const w = getCompletionRewards(m as any).ratingWeight
        weightedSum += r.score * w
        weightSum += w
      }

      const weightedAvg = weightSum > 0 ? Math.round((weightedSum / weightSum) * 10) / 10 : score
      await db.user.update({
        where: { id: targetId },
        data: { driverRatingAvg: weightedAvg, driverRatingCount: allDriverRatings.length },
      })
    }

    // Reputation: +5 if score >= 4 (for REQUESTER_CONFIRMED), +3 for AUTO_CLOSED
    if (score >= 4) {
      const repPoints = ride.trip.completionMode === 'AUTO_CLOSED' ? 3 : 5
      await addReputation({ userId: targetId, action: 'ride_rated', points: repPoints, fromUserId: session.userId, postId: ride.id })
    }

    await logRideEvent({
      rideRequestId: ride.id,
      tripId: ride.trip.id,
      eventType: 'RATING_SUBMITTED',
      actorType: isRequester ? 'requester' : 'driver',
      actorId: session.userId,
      metadata: { ratingId: rating.id, score, role, completionMode: ride.trip.completionMode },
    })

    // Notify the rated party
    const stars = '⭐'.repeat(score)
    await db.notification.create({
      data: {
        userId: targetId,
        type: 'RIDE_RATING',
        actorId: session.userId,
        title: 'تم تقييمك',
        titleEn: 'You were rated',
        body: `${stars} ${score}/5`,
        bodyEn: `${stars} ${score}/5`,
        rideRequestId: ride.id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/rides/[id]/rate' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

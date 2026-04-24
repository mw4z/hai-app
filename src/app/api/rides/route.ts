import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { calculateRoute, validateDistance } from '@/lib/rides/distance'
import { estimatePrice } from '@/lib/rides/pricing'
import { logRideEvent } from '@/lib/rides/events'
import { kickNotifCron } from '@/lib/kickNotifCron'
import { log } from '@/lib/logger'
import { getLimits } from '@/lib/capabilities'
import { requireVerified } from '@/lib/requireVerified'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'

const REQUESTS_PER_HOUR = 3
const IMMEDIATE_EXPIRY_HOURS = 2

/** POST — Create a ride request */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const gate = await requireVerified(session.userId)
    if (gate) return gate

    log.api('POST', '/api/rides', session.userId)

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
    const {
      pickupLat, pickupLng, pickupAddress, pickupArea,
      dropoffLat, dropoffLng, dropoffAddress, dropoffArea,
      isImmediate, scheduledAt, notes,
    } = body

    // ── Validation ──────────────────────────────────────────────────────────────

    if (!pickupLat || !pickupLng || !pickupAddress || !pickupArea) {
      return NextResponse.json({ error: 'بيانات نقطة الانطلاق ناقصة' }, { status: 400 })
    }
    if (!dropoffLat || !dropoffLng || !dropoffAddress || !dropoffArea) {
      return NextResponse.json({ error: 'بيانات الوجهة ناقصة' }, { status: 400 })
    }
    // Validate coordinates are valid numbers in Saudi Arabia range
    if (typeof pickupLat !== 'number' || typeof pickupLng !== 'number' ||
        typeof dropoffLat !== 'number' || typeof dropoffLng !== 'number' ||
        isNaN(pickupLat) || isNaN(pickupLng) || isNaN(dropoffLat) || isNaN(dropoffLng)) {
      return NextResponse.json({ error: 'بيانات الإحداثيات غير صالحة' }, { status: 400 })
    }
    if (pickupAddress.length < 5 || pickupAddress.length > 200) {
      return NextResponse.json({ error: 'عنوان الانطلاق غير صالح' }, { status: 400 })
    }
    if (dropoffAddress.length < 5 || dropoffAddress.length > 200) {
      return NextResponse.json({ error: 'عنوان الوجهة غير صالح' }, { status: 400 })
    }
    if (notes && notes.length > 200) {
      return NextResponse.json({ error: 'الملاحظات طويلة جداً' }, { status: 400 })
    }

    // Distance validation
    const route = calculateRoute(pickupLat, pickupLng, dropoffLat, dropoffLng)
    const distCheck = validateDistance(route.distanceKm)
    if (!distCheck.valid) {
      return NextResponse.json({ error: distCheck.error }, { status: 400 })
    }

    // Scheduled time validation
    if (!isImmediate) {
      if (!scheduledAt) {
        return NextResponse.json({ error: 'حدد وقت الرحلة' }, { status: 400 })
      }
      const schedDate = new Date(scheduledAt)
      const minTime = Date.now() + 30 * 60 * 1000   // 30 min from now
      const maxTime = Date.now() + 48 * 3600 * 1000  // 48 hours
      if (schedDate.getTime() < minTime || schedDate.getTime() > maxTime) {
        return NextResponse.json({ error: 'وقت الرحلة يجب أن يكون بين 30 دقيقة و48 ساعة من الآن' }, { status: 400 })
      }
    }

    // ── Rate limits (capability-based, bypassed for SUPER_ADMIN) ────────────────

    const rideUser = await db.user.findUnique({ where: { id: session.userId }, select: { plan: true, role: true } })
    const bypass = isSuperAdminRole(rideUser?.role)
    const limits = getLimits(rideUser?.plan || 'FREE')

    if (!bypass) {
      const activeCount = await db.rideRequest.count({
        where: {
          requesterId: session.userId,
          status: { in: ['RIDE_OPEN', 'RIDE_SELECTED', 'RIDE_CONFIRMED', 'RIDE_EN_ROUTE', 'RIDE_ARRIVED', 'RIDE_IN_PROGRESS'] },
        },
      })
      if (activeCount >= limits.activeRideRequests) {
        return NextResponse.json({ error: 'لديك طلب نشط بالفعل' }, { status: 429 })
      }

      // Max 3 requests per hour
      const hourAgo = new Date(Date.now() - 3600 * 1000)
      const recentCount = await db.rideRequest.count({
        where: { requesterId: session.userId, createdAt: { gte: hourAgo } },
      })
      if (recentCount >= REQUESTS_PER_HOUR) {
        return NextResponse.json({ error: 'تجاوزت الحد الأقصى (3 طلبات بالساعة)' }, { status: 429 })
      }
    }

    // ── Calculate pricing ───────────────────────────────────────────────────────

    const departureHour = isImmediate ? new Date().getHours() : new Date(scheduledAt).getHours()
    const priceEst = estimatePrice(route.distanceKm, route.durationMin, departureHour)

    // ── Expiry ──────────────────────────────────────────────────────────────────

    let expiresAt: Date
    if (isImmediate) {
      expiresAt = new Date(Date.now() + IMMEDIATE_EXPIRY_HOURS * 3600 * 1000)
    } else {
      // Scheduled: open until scheduledAt + 15min grace window
      expiresAt = new Date(new Date(scheduledAt).getTime() + 15 * 60 * 1000)
    }

    // ── Create ──────────────────────────────────────────────────────────────────

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { neighborhoodId: true },
    })

    const ride = await db.rideRequest.create({
      data: {
        requesterId: session.userId,
        pickupLat, pickupLng, pickupAddress, pickupArea,
        dropoffLat, dropoffLng, dropoffAddress, dropoffArea,
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        estimatedMinPrice: priceEst.min,
        estimatedMaxPrice: priceEst.max,
        isImmediate: isImmediate !== false,
        scheduledAt: isImmediate ? null : new Date(scheduledAt),
        notes: notes?.trim() || null,
        expiresAt,
        neighborhoodId: user?.neighborhoodId || null,
      },
    })

    await logRideEvent({
      rideRequestId: ride.id,
      eventType: 'REQUEST_CREATED',
      actorType: 'requester',
      actorId: session.userId,
      metadata: { distanceKm: route.distanceKm, durationMin: route.durationMin, priceEst },
    })

    // Fan-out: every neighbor in the same neighborhood gets a push so
    // potential drivers see the request instantly. Dedicated job type
    // 'new_ride_request' — the cron processor validates against the
    // ride row (not a post row) and reuses the new-post fan-out logic
    // for filtering (author exclusion, notif prefs, quiet hours,
    // gender). priority:'high' so the banner fires immediately.
    if (ride.neighborhoodId) {
      db.notifJob.create({
        data: {
          type: 'new_ride_request',
          priority: 'high',
          targetType: 'nbhd_topic',
          targetRef: ride.neighborhoodId,
          payload: {
            rideRequestId: ride.id,
            requesterId: session.userId,
            pickupArea,
            dropoffArea,
          },
        },
      }).catch((err) => {
        console.error('[NOTIF_JOB] enqueue new_ride_request failed:', err)
      })
      kickNotifCron()
    }

    return NextResponse.json({
      id: ride.id,
      distanceKm: ride.distanceKm,
      durationMin: ride.durationMin,
      estimatedMinPrice: ride.estimatedMinPrice,
      estimatedMaxPrice: ride.estimatedMaxPrice,
      status: ride.status,
      expiresAt: ride.expiresAt.toISOString(),
    }, { status: 201 })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/rides POST' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

/** GET — List OPEN ride requests */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('GET', '/api/rides', session.userId)

    const { searchParams } = new URL(req.url)
    const cursor = searchParams.get('cursor')
    const neighborhoodId = searchParams.get('neighborhood')

    const now = new Date()

    const rides = await db.rideRequest.findMany({
      where: {
        status: 'RIDE_OPEN',
        expiresAt: { gt: now },
        // Scheduled rides: only show if within 2 hours of departure
        OR: [
          { isImmediate: true },
          { scheduledAt: { lte: new Date(now.getTime() + 2 * 3600 * 1000) } },
        ],
        ...(neighborhoodId ? { neighborhoodId } : {}),
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      select: {
        id: true,
        pickupArea: true,
        dropoffArea: true,
        distanceKm: true,
        durationMin: true,
        estimatedMinPrice: true,
        estimatedMaxPrice: true,
        isImmediate: true,
        scheduledAt: true,
        notes: true,
        status: true,
        createdAt: true,
        requester: {
          select: { id: true, name: true, avatarUrl: true, reputation: true },
        },
        _count: { select: { offers: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return NextResponse.json({
      rides: rides.map(r => {
        // Mark scheduled rides as late if past their scheduledAt
        const isLate = !r.isImmediate && r.scheduledAt && new Date(r.scheduledAt) < now
        return {
          ...r,
          offerCount: r._count.offers,
          isLate: isLate || false,
          _count: undefined,
        }
      }),
      nextCursor: rides.length === 20 ? rides[rides.length - 1].createdAt.toISOString() : null,
    })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/rides GET' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

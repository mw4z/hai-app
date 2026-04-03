import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { validateOfferPrice } from '@/lib/rides/pricing'
import { logRideEvent } from '@/lib/rides/events'
import { notifyNewOffer } from '@/lib/rides/notify'
import { log } from '@/lib/logger'

const MIN_ACCOUNT_AGE_DAYS = 0 // TODO: set back to 3 for production
const MAX_OFFERS_PER_HOUR = 10

/** POST — Submit an offer on a ride */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', '/api/rides/[id]/offers', session.userId)

    const ride = await db.rideRequest.findUnique({
      where: { id: params.id },
      select: {
        id: true, status: true, requesterId: true,
        estimatedMinPrice: true, estimatedMaxPrice: true,
      },
    })

    if (!ride) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Must be OPEN
    if (ride.status !== 'RIDE_OPEN') {
      return NextResponse.json({ error: 'الطلب لم يعد يقبل عروض' }, { status: 409 })
    }

    // Cannot offer on own request
    if (ride.requesterId === session.userId) {
      return NextResponse.json({ error: 'لا يمكنك تقديم عرض على طلبك' }, { status: 403 })
    }

    // Account age check
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { name: true, createdAt: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const ageDays = Math.floor((Date.now() - user.createdAt.getTime()) / 86400000)
    if (ageDays < MIN_ACCOUNT_AGE_DAYS) {
      return NextResponse.json({ error: `حسابك يجب أن يكون عمره ${MIN_ACCOUNT_AGE_DAYS} أيام على الأقل` }, { status: 403 })
    }

    // Rate limit: max offers per hour
    const hourAgo = new Date(Date.now() - 3600 * 1000)
    const recentOffers = await db.rideOffer.count({
      where: { driverId: session.userId, createdAt: { gte: hourAgo } },
    })
    if (recentOffers >= MAX_OFFERS_PER_HOUR) {
      return NextResponse.json({ error: 'تجاوزت الحد الأقصى للعروض' }, { status: 429 })
    }

    // Already offered check (@@unique will also catch this, but better UX)
    const existing = await db.rideOffer.findUnique({
      where: { rideRequestId_driverId: { rideRequestId: ride.id, driverId: session.userId } },
    })
    if (existing) {
      return NextResponse.json({ error: 'لديك عرض على هذا الطلب بالفعل' }, { status: 409 })
    }

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
    const { price, arrivalMin, message } = body

    // Validate fields
    if (!price || !Number.isInteger(price) || price < 1) {
      return NextResponse.json({ error: 'أدخل سعراً صحيحاً' }, { status: 400 })
    }
    if (!arrivalMin || !Number.isInteger(arrivalMin) || arrivalMin < 1 || arrivalMin > 120) {
      return NextResponse.json({ error: 'وقت الوصول يجب أن يكون بين 1 و120 دقيقة' }, { status: 400 })
    }
    if (message && message.length > 100) {
      return NextResponse.json({ error: 'الرسالة طويلة جداً (100 حرف كحد أقصى)' }, { status: 400 })
    }

    // Price validation (spam protection)
    const priceCheck = validateOfferPrice(price, ride.estimatedMinPrice, ride.estimatedMaxPrice)
    if (priceCheck.blocked) {
      return NextResponse.json({ error: priceCheck.reason }, { status: 400 })
    }

    // Create offer
    const offer = await db.rideOffer.create({
      data: {
        rideRequestId: ride.id,
        driverId: session.userId,
        price,
        arrivalMin,
        message: message?.trim() || null,
      },
    })

    await logRideEvent({
      rideRequestId: ride.id,
      eventType: 'OFFER_SUBMITTED',
      actorType: 'driver',
      actorId: session.userId,
      metadata: { offerId: offer.id, price, arrivalMin },
    })

    // Notify requester
    await notifyNewOffer(ride.requesterId, session.userId, user.name || 'سائق', ride.id, price)

    return NextResponse.json({
      id: offer.id,
      price: offer.price,
      arrivalMin: offer.arrivalMin,
      message: offer.message,
      status: offer.status,
      priceTooLow: priceCheck.tooLow,
      priceTooHigh: priceCheck.tooHigh,
    }, { status: 201 })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/rides/[id]/offers POST' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

/** PATCH — Edit an existing offer (only while ride is OPEN) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('PATCH', '/api/rides/[id]/offers', session.userId)

    const ride = await db.rideRequest.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, requesterId: true, estimatedMinPrice: true, estimatedMaxPrice: true },
    })
    if (!ride) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (ride.status !== 'RIDE_OPEN') {
      return NextResponse.json({
        error: 'OFFER_NOT_EDITABLE',
        message: 'لا يمكن تعديل العرض بعد بدء الاختيار',
        messageEn: 'Cannot edit offer after selection started',
        shouldRefresh: true,
        currentStatus: ride.status,
      }, { status: 409 })
    }

    // Find caller's offer
    const existing = await db.rideOffer.findUnique({
      where: { rideRequestId_driverId: { rideRequestId: ride.id, driverId: session.userId } },
    })
    if (!existing) return NextResponse.json({ error: 'لا يوجد عرض لك على هذا الطلب' }, { status: 404 })
    if (existing.status !== 'OFFER_PENDING') {
      return NextResponse.json({ error: 'OFFER_NOT_EDITABLE', message: 'العرض لم يعد قابلاً للتعديل', messageEn: 'Offer no longer editable', shouldRefresh: true }, { status: 409 })
    }

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
    const updates: Record<string, unknown> = {}
    const before: Record<string, unknown> = {}

    if (body.price !== undefined) {
      if (!Number.isInteger(body.price) || body.price < 1) {
        return NextResponse.json({ error: 'أدخل سعراً صحيحاً' }, { status: 400 })
      }
      const priceCheck = validateOfferPrice(body.price, ride.estimatedMinPrice, ride.estimatedMaxPrice)
      if (priceCheck.blocked) {
        return NextResponse.json({ error: priceCheck.reason }, { status: 400 })
      }
      before.price = existing.price
      updates.price = body.price
    }

    if (body.arrivalMin !== undefined) {
      if (!Number.isInteger(body.arrivalMin) || body.arrivalMin < 1 || body.arrivalMin > 120) {
        return NextResponse.json({ error: 'وقت الوصول يجب أن يكون بين 1 و120 دقيقة' }, { status: 400 })
      }
      before.arrivalMin = existing.arrivalMin
      updates.arrivalMin = body.arrivalMin
    }

    if (body.message !== undefined) {
      if (body.message && body.message.length > 100) {
        return NextResponse.json({ error: 'الرسالة طويلة جداً' }, { status: 400 })
      }
      before.message = existing.message
      updates.message = body.message?.trim() || null
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'لا يوجد تغييرات' }, { status: 400 })
    }

    const updated = await db.rideOffer.update({
      where: { id: existing.id },
      data: { ...updates, editCount: { increment: 1 } },
    })

    await logRideEvent({
      rideRequestId: ride.id,
      eventType: 'OFFER_UPDATED',
      actorType: 'driver',
      actorId: session.userId,
      metadata: { offerId: existing.id, before, after: updates, editCount: updated.editCount },
    })

    // Notify requester only if price decreased (beneficial)
    if (updates.price && (updates.price as number) < existing.price) {
      const user = await db.user.findUnique({ where: { id: session.userId }, select: { name: true } })
      await db.notification.create({
        data: {
          userId: ride.requesterId,
          type: 'RIDE_OFFER',
          actorId: session.userId,
          title: 'تم تعديل عرض',
          titleEn: 'Offer updated',
          body: `${user?.name || 'سائق'} خفّض السعر إلى ${updates.price} ريال`,
          bodyEn: `${user?.name || 'Driver'} lowered price to ${updates.price} SAR`,
          rideRequestId: ride.id,
        },
      })
    }

    return NextResponse.json({
      id: updated.id,
      price: updated.price,
      arrivalMin: updated.arrivalMin,
      message: updated.message,
      editCount: updated.editCount,
      updatedAt: updated.updatedAt,
    })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/rides/[id]/offers PATCH' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

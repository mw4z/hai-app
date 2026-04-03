import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { CHAT_ALLOWED_STATES } from '@/lib/rides/state-machine'
import type { RideStatus } from '@/lib/rides/state-machine'
import { log } from '@/lib/logger'

/** GET — Get ride chat messages */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('GET', '/api/rides/[id]/messages', session.userId)

    const ride = await db.rideRequest.findUnique({
      where: { id: params.id },
      select: { status: true, requesterId: true, trip: { select: { driverId: true, completedAt: true } } },
    })
    if (!ride) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Must be participant
    const isRequester = session.userId === ride.requesterId
    const isDriver = session.userId === ride.trip?.driverId
    if (!isRequester && !isDriver) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Read-only access for 1 hour after completion
    const status = ride.status as RideStatus
    if (status === 'RIDE_COMPLETED' && ride.trip?.completedAt) {
      const elapsed = Date.now() - ride.trip.completedAt.getTime()
      if (elapsed > 3600 * 1000) {
        return NextResponse.json({ error: 'المحادثة مغلقة' }, { status: 403 })
      }
    } else if (!CHAT_ALLOWED_STATES.includes(status) && status !== 'RIDE_COMPLETED') {
      return NextResponse.json({ error: 'المحادثة غير متاحة في هذه المرحلة' }, { status: 403 })
    }

    const messages = await db.rideMessage.findMany({
      where: { rideRequestId: params.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })

    return NextResponse.json(messages)
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/rides/[id]/messages GET' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

/** POST — Send a message in ride chat */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', '/api/rides/[id]/messages', session.userId)

    const ride = await db.rideRequest.findUnique({
      where: { id: params.id },
      select: { status: true, requesterId: true, trip: { select: { driverId: true } } },
    })
    if (!ride) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Must be participant
    const isRequester = session.userId === ride.requesterId
    const isDriver = session.userId === ride.trip?.driverId
    if (!isRequester && !isDriver) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Must be in chat-allowed state
    if (!CHAT_ALLOWED_STATES.includes(ride.status as RideStatus)) {
      return NextResponse.json({ error: 'المحادثة غير متاحة في هذه المرحلة' }, { status: 403 })
    }

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
    const { body: text, type, lat, lng } = body

    if (type === 'LOCATION') {
      if (!lat || !lng) return NextResponse.json({ error: 'Coordinates required' }, { status: 400 })
    } else if (type === 'IMAGE') {
      if (!body.imageUrl) return NextResponse.json({ error: 'Image URL required' }, { status: 400 })
    } else {
      if (!text || text.trim().length === 0) return NextResponse.json({ error: 'الرسالة فارغة' }, { status: 400 })
      if (text.length > 500) return NextResponse.json({ error: 'الرسالة طويلة جداً' }, { status: 400 })
    }

    const msgType = type === 'LOCATION' ? 'LOCATION' : type === 'IMAGE' ? 'IMAGE' : 'TEXT'
    const msgBody = type === 'LOCATION' ? `📍 ${lat},${lng}` : type === 'IMAGE' ? '📷' : text.trim()

    const message = await db.rideMessage.create({
      data: {
        rideRequestId: params.id,
        senderId: session.userId,
        body: msgBody,
        type: msgType,
        lat: type === 'LOCATION' ? lat : null,
        lng: type === 'LOCATION' ? lng : null,
        imageUrl: type === 'IMAGE' ? body.imageUrl : null,
      },
    })

    // Notify the other party
    const recipientId = isRequester ? ride.trip?.driverId : ride.requesterId
    if (recipientId) {
      const notifBody = type === 'LOCATION' ? '📍 موقع' : type === 'IMAGE' ? '📷 صورة' : text.trim().slice(0, 50)
      const notifBodyEn = type === 'LOCATION' ? '📍 Location' : type === 'IMAGE' ? '📷 Photo' : text.trim().slice(0, 50)
      await db.notification.create({
        data: {
          userId: recipientId,
          type: 'RIDE_MESSAGE',
          actorId: session.userId,
          title: 'رسالة جديدة',
          titleEn: 'New message',
          body: notifBody,
          bodyEn: notifBodyEn,
          rideRequestId: params.id,
        },
      })
    }

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/rides/[id]/messages POST' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

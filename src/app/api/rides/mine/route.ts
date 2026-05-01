import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

/** GET — My ride requests + rides I offered on */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get('status')

  // ── Quick status check mode (for global arrival alert polling) ──────────────
  if (statusFilter) {
    const rides = await db.rideRequest.findMany({
      where: {
        status: statusFilter as any,
        OR: [
          { requesterId: session.userId },
          { trip: { driverId: session.userId } },
        ],
      },
      select: {
        id: true,
        status: true,
        requesterId: true,
        type: true,
        trip: { select: { driverId: true } },
      },
    })

    // Get names for the other party
    const userIds = Array.from(new Set(
      [...rides.map(r => r.trip?.driverId), ...rides.map(r => r.requesterId)].filter(Boolean)
    )) as string[]
    const users = userIds.length > 0
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, lastName: true } })
      : []
    const nameMap = Object.fromEntries(users.map(u => [u.id, [u.name?.trim(), u.lastName?.trim()].filter(Boolean).join(' ') || u.name]))

    return NextResponse.json(rides.map(r => ({
      id: r.id,
      status: r.status,
      type: r.type,
      role: r.requesterId === session.userId ? 'requester' : 'driver',
      driverName: r.trip?.driverId ? nameMap[r.trip.driverId] || null : null,
      requesterName: nameMap[r.requesterId] || null,
    })))
  }

  // ── Full listing (existing behavior) ────────────────────────────────────────
  // My requests
  const myRequests = await db.rideRequest.findMany({
    where: { requesterId: session.userId },
    select: {
      id: true, pickupArea: true, dropoffArea: true,
      distanceKm: true, durationMin: true,
      status: true, isImmediate: true, scheduledAt: true,
      type: true, itemDescription: true,
      createdAt: true,
      _count: { select: { offers: true } },
      trip: { select: { agreedPrice: true, driverId: true, completedAt: true, completionMode: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  // My offers (rides I offered to drive)
  const myOffers = await db.rideOffer.findMany({
    where: { driverId: session.userId },
    select: {
      id: true, price: true, arrivalMin: true, status: true, createdAt: true,
      rideRequest: {
        select: {
          id: true, pickupArea: true, dropoffArea: true,
          distanceKm: true, status: true, createdAt: true,
          type: true, itemDescription: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json({ myRequests, myOffers })
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { COORDS_VISIBLE_STATES } from '@/lib/rides/state-machine'

/** GET — Ride detail with privacy filtering */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ride = await db.rideRequest.findUnique({
    where: { id: params.id },
    include: {
      requester: { select: { id: true, name: true, lastName: true, avatarUrl: true, reputation: true } },
      offers: {
        include: {
          driver: {
            select: {
              id: true, name: true, lastName: true, avatarUrl: true,
              driverRatingAvg: true, driverTripsCount: true, driverCancelCount: true,
              reputation: true, accountType: true, providerStatus: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      trip: true,
      _count: { select: { offers: true } },
    },
  })

  if (!ride) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const userId = session.userId
  const isRequester = userId === ride.requesterId
  const selectedDriverId = ride.trip?.driverId || null
  const isSelectedDriver = userId === selectedDriverId
  const isParticipant = isRequester || isSelectedDriver

  // ── Privacy: coordinates ────────────────────────────────────────────────────
  const showExactCoords = isRequester || (isSelectedDriver && COORDS_VISIBLE_STATES.includes(ride.status as any))

  // ── Privacy: offers ─────────────────────────────────────────────────────────
  // Requester sees all offers with driver stats
  // Drivers see only their own offer
  let filteredOffers
  if (isRequester) {
    filteredOffers = ride.offers.map(o => ({
      id: o.id,
      price: o.price,
      arrivalMin: o.arrivalMin,
      message: o.message,
      status: o.status,
      createdAt: o.createdAt,
      driver: {
        id: o.driver.id,
        name: o.driver.name,
        lastName: o.driver.lastName,
        avatarUrl: o.driver.avatarUrl,
        driverRatingAvg: o.driver.driverRatingAvg,
        driverTripsCount: o.driver.driverTripsCount,
        cancelRate: o.driver.driverTripsCount > 0
          ? Math.round((o.driver.driverCancelCount / o.driver.driverTripsCount) * 100)
          : 0,
        reputation: o.driver.reputation,
        accountType: o.driver.accountType,
      },
    }))
  } else {
    const myOffer = ride.offers.find(o => o.driverId === userId)
    filteredOffers = myOffer ? [{
      id: myOffer.id,
      driverId: myOffer.driverId,
      price: myOffer.price,
      arrivalMin: myOffer.arrivalMin,
      message: myOffer.message,
      status: myOffer.status,
      createdAt: myOffer.createdAt,
    }] : []
  }

  // ── Build response ──────────────────────────────────────────────────────────
  const response: Record<string, unknown> = {
    id: ride.id,
    pickupArea: ride.pickupArea,
    dropoffArea: ride.dropoffArea,
    distanceKm: ride.distanceKm,
    durationMin: ride.durationMin,
    estimatedMinPrice: ride.estimatedMinPrice,
    estimatedMaxPrice: ride.estimatedMaxPrice,
    isImmediate: ride.isImmediate,
    scheduledAt: ride.scheduledAt,
    notes: ride.notes,
    status: ride.status,
    offerCount: ride._count.offers,
    createdAt: ride.createdAt,
    expiresAt: ride.expiresAt,
    requester: ride.requester,
    offers: filteredOffers,
  }

  // Exact coordinates: only for requester or confirmed driver
  if (showExactCoords) {
    response.pickupLat = ride.pickupLat
    response.pickupLng = ride.pickupLng
    response.pickupAddress = ride.pickupAddress
    response.dropoffLat = ride.dropoffLat
    response.dropoffLng = ride.dropoffLng
    response.dropoffAddress = ride.dropoffAddress
  }

  // Trip data: only for participants
  if (ride.trip && isParticipant) {
    response.trip = {
      id: ride.trip.id,
      agreedPrice: ride.trip.agreedPrice,
      confirmedAt: ride.trip.confirmedAt,
      enRouteAt: ride.trip.enRouteAt,
      arrivedAt: ride.trip.arrivedAt,
      startedAt: ride.trip.startedAt,
      driverMarkedDoneAt: ride.trip.driverMarkedDoneAt,
      requesterConfirmedDoneAt: ride.trip.requesterConfirmedDoneAt,
      completedAt: ride.trip.completedAt,
      completionMode: ride.trip.completionMode,
      cancelledAt: ride.trip.cancelledAt,
      cancelledBy: ride.trip.cancelledBy,
    }
  }

  return NextResponse.json(response)
}

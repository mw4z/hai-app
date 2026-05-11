import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import RidesFeedClient from './RidesFeedClient'

export default async function RidesPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Server-render the rides dashboard's default view ("all" tab, RIDE
  // sub-filter) so the list is on screen the moment the page paints —
  // no spinner-then-content flash. Mirrors the query in
  // GET /api/rides?type=RIDE. The client still re-fetches when the
  // user switches tab/sub-filter, and on its 10s poll.
  const now = new Date()
  const ridesRaw = await db.rideRequest.findMany({
    where: {
      status: 'RIDE_OPEN',
      expiresAt: { gt: now },
      OR: [
        { isImmediate: true },
        { scheduledAt: { lte: new Date(now.getTime() + 2 * 3600 * 1000) } },
      ],
      type: 'RIDE',
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
      type: true,
      itemDescription: true,
      status: true,
      createdAt: true,
      requester: { select: { id: true, name: true, lastName: true, avatarUrl: true, reputation: true } },
      _count: { select: { offers: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  }).catch(() => [])

  const initialRides = ridesRaw.map(r => {
    const isLate = !r.isImmediate && r.scheduledAt && new Date(r.scheduledAt) < now
    const { _count, ...rest } = r as typeof r & { _count: { offers: number } }
    return { ...rest, offerCount: _count.offers, isLate: isLate || false }
  })

  return (
    <RidesFeedClient
      userId={session.userId}
      initialRides={JSON.parse(JSON.stringify(initialRides))}
    />
  )
}

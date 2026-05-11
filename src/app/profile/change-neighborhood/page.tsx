import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import ChangeNeighborhoodClient from './ChangeNeighborhoodClient'

const MAX_CHANGES_PER_MONTH = 2

export default async function ChangeNeighborhoodPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Server-render the "changes remaining / pending request" banner so
  // it's there from first paint. Mirrors GET /api/profile/change-neighborhood.
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [changesThisMonth, pendingRequest] = await Promise.all([
    db.neighborhoodChangeLog.count({
      where: { userId: session.userId, createdAt: { gte: startOfMonth } },
    }).catch(() => 0),
    db.neighborhoodChangeRequest.findFirst({
      where: { userId: session.userId, status: 'pending' },
      select: { id: true, status: true, createdAt: true },
    }).catch(() => null),
  ])

  const initialInfo = {
    remaining: Math.max(0, MAX_CHANGES_PER_MONTH - changesThisMonth),
    pendingRequest: pendingRequest || null,
  }

  return <ChangeNeighborhoodClient initialInfo={JSON.parse(JSON.stringify(initialInfo))} />
}

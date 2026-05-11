import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import NeighborhoodReportsClient from './NeighborhoodReportsClient'

export default async function NeighborhoodReportsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Server-render the user's reports so the list is on screen from the
  // first paint — no spinner-then-content. Mirrors GET /api/neighborhood-report.
  const reports = await db.neighborhoodReport.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  }).catch(() => [])

  return <NeighborhoodReportsClient initialReports={JSON.parse(JSON.stringify(reports))} />
}

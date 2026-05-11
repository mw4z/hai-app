import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import SupportClient from './SupportClient'

export default async function SupportPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Server-render the user's support tickets so the list is on screen
  // from first paint — no spinner-then-content. Mirrors GET /api/support.
  const tickets = await db.supportTicket.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  }).catch(() => [])

  return <SupportClient initialTickets={JSON.parse(JSON.stringify(tickets))} />
}

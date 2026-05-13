import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import PollRequestClient from './PollRequestClient'

export default async function PollRequestPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Profile-completeness + neighborhood gate. Same shape as the feed
  // / market / threads pages so the redirect target is consistent.
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { name: true, neighborhoodId: true },
  })
  if (!user?.neighborhoodId || !user.name?.trim()) redirect('/onboarding')

  return <PollRequestClient />
}

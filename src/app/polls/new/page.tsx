import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import PollCreateClient from './PollCreateClient'

export const dynamic = 'force-dynamic'

/** Direct poll creation — admin / mod only.
 *
 *  Residents land on /polls/request instead (proposes a poll for
 *  mod review). Admins bypass that review path entirely and post
 *  the poll straight to the feed. Symmetric UX: both flows live
 *  off the BottomNav's "+" entry sheet at the same surface, the
 *  only difference is which destination the button routes to
 *  based on role. */
export default async function PollCreatePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true },
  })
  if (!user) redirect('/login')

  // Direct poll creation has always been admin-only — same gate
  // as POST /api/polls. Residents land here only if they
  // typed the URL manually; bounce them to the request flow.
  const isAdmin = ['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD'].includes(user.role)
  if (!isAdmin) redirect('/polls/request')
  if (!user.neighborhoodId) redirect('/onboarding')

  return <PollCreateClient />
}

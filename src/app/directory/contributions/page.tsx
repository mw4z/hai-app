import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { ssrPublicGateOrNotFound } from '@/lib/places/ssrGate'
import ContributionsClient from './ContributionsClient'

export const dynamic = 'force-dynamic'

export default async function ContributionsPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!user) redirect('/login')
  ssrPublicGateOrNotFound(user.role)
  return <ContributionsClient />
}

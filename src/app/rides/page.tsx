import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import RidesFeedClient from './RidesFeedClient'

export default async function RidesPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return <RidesFeedClient userId={session.userId} />
}

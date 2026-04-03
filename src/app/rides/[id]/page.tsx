import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import RideDetailClient from './RideDetailClient'

export default async function RideDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return <RideDetailClient rideId={params.id} currentUserId={session.userId} />
}

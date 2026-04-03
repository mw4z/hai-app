import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import HomeClient from './HomeClient'

export default async function HomePage() {
  const session = await getSession()
  if (session) redirect('/feed')

  return <HomeClient />
}

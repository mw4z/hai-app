import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { isSquareAdminRole } from '@/lib/square/isSquareAdmin'
import NewSquareClient from './NewSquareClient'

export const dynamic = 'force-dynamic'

/** Square composer — same admin gate as the list / detail screens. */
export default async function NewSquareThreadPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!user) redirect('/login')
  if (!user.neighborhoodId) notFound()
  if (!isSquareAdminRole(user.role)) notFound()

  return <NewSquareClient />
}

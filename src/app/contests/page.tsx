import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import ContestsClient from './ContestsClient'

export default async function ContestsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  })

  const isAdmin = user ? ['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD'].includes(user.role) : false

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <ContestsClient isAdmin={isAdmin} />
      {/* BottomNav is mounted globally in src/app/layout.tsx */}
    </div>
  )
}

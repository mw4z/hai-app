import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { directoryServerMode } from '@/lib/places/featureFlag'
import { isDirectoryModerator } from '@/lib/places/isDirectoryModerator'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import ModServiceContactsClient from './ModServiceContactsClient'

export const dynamic = 'force-dynamic'

/** Mod queue for service contacts: pending / hidden / reported, with
 *  approve / hide / remove / dismiss actions. Same gate as the place
 *  mod dashboard. */
export default async function ModServiceContactsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  })
  if (!user) redirect('/login')

  const mode = directoryServerMode()
  if (mode === 'off' && !isSuperAdminRole(user.role)) notFound()
  if (mode === 'admin' && !isDirectoryModerator(user.role)) notFound()
  if (mode === 'on' && !isDirectoryModerator(user.role)) notFound()

  return <ModServiceContactsClient />
}

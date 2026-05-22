import { redirect, notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { canManagePinned } from '@/lib/pinnedItems/pinnedItems'
import ModPinnedClient from './ModPinnedClient'

export const dynamic = 'force-dynamic'

/** Pinned-items management — scoped to the moderator's own neighborhood.
 *  (Platform/super manage other neighborhoods via the API's ?neighborhood
 *  routing; this page targets the mod's own hood.) */
export default async function ModPinnedPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true, neighborhood: { select: { name: true } } },
  })
  if (!user) redirect('/login')
  if (!canManagePinned(user.role)) notFound()
  if (!user.neighborhoodId) notFound()

  return <ModPinnedClient neighborhoodId={user.neighborhoodId} neighborhoodName={user.neighborhood?.name ?? ''} />
}

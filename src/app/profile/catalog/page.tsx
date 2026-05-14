import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import CatalogClient from './CatalogClient'

export default async function CatalogPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Server-render the user's catalog items so the grid is on screen
  // from first paint — no spinner-then-content. Mirrors GET
  // /api/service-items/mine; the new visibility flags are included
  // so the editor can render the per-item toggles immediately.
  const items = await db.serviceItem.findMany({
    where: { userId: session.userId },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true, title: true, description: true, price: true,
      imageUrl: true, active: true,
      showOnProfile: true, showOnPlace: true,
    },
  }).catch(() => [])

  // Does this user own (claim) a directory place? Determines
  // whether the place-visibility toggles + "show all on place"
  // bulk action are meaningful. With no claimed place those
  // toggles are inert noise, so we hide them.
  const claimedPlace = await db.placeListing
    .findFirst({
      where: { claimedByUserId: session.userId, status: { not: 'REMOVED' } },
      select: { id: true, name: true },
    })
    .catch(() => null)

  return (
    <CatalogClient
      initialItems={JSON.parse(JSON.stringify(items))}
      claimedPlace={claimedPlace ? { id: claimedPlace.id, name: claimedPlace.name } : null}
    />
  )
}

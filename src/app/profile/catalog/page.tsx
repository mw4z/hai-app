import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import CatalogClient from './CatalogClient'

export default async function CatalogPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Server-render the user's catalog items so the grid is on screen
  // from first paint — no spinner-then-content. Mirrors GET /api/service-items/mine.
  const items = await db.serviceItem.findMany({
    where: { userId: session.userId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, title: true, description: true, price: true, imageUrl: true, active: true },
  }).catch(() => [])

  return <CatalogClient initialItems={JSON.parse(JSON.stringify(items))} />
}

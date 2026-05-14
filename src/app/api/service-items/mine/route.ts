import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

/** GET — current user's service items (for catalog management) */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Owner-private view — return everything, including the
  // showOnProfile / showOnPlace flags so the editor can render
  // per-item toggles. Public surfaces filter elsewhere.
  const items = await db.serviceItem.findMany({
    where: { userId: session.userId },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true, title: true, description: true, price: true,
      imageUrl: true, active: true,
      showOnProfile: true, showOnPlace: true,
    },
  })

  return NextResponse.json(items)
}

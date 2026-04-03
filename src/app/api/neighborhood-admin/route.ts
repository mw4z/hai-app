import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

/** GET — Find the neighborhood admin for the current user's neighborhood */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { neighborhoodId: true },
  })
  if (!user?.neighborhoodId) {
    return NextResponse.json({ admin: null })
  }

  // Find neighborhood mod for this neighborhood
  const mod = await db.user.findFirst({
    where: {
      neighborhoodId: user.neighborhoodId,
      role: 'NEIGHBORHOOD_MOD',
      status: 'ACTIVE',
    },
    select: { id: true, name: true, avatarUrl: true, role: true },
  })

  // Fallback to any super admin
  if (!mod) {
    const superAdmin = await db.user.findFirst({
      where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      select: { id: true, name: true, avatarUrl: true, role: true },
    })
    return NextResponse.json({ admin: superAdmin, type: 'super_admin' })
  }

  return NextResponse.json({ admin: mod, type: 'neighborhood_mod' })
}

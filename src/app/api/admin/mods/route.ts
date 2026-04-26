import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']

/**
 * GET /api/admin/mods
 *
 * Moderator health roster. NEIGHBORHOOD_MOD sees their own neighborhood
 * only; PLATFORM_MOD + SUPER_ADMIN see every mod.
 *
 * Returns the fields the admin dashboard panel needs to render at a
 * glance: current modStatus, activity counters, last-action timestamp,
 * pending report count. Sort: UNDER_REVIEW first, then SUSPENDED, then
 * INACTIVE, then ACTIVE — riskiest first.
 */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true },
  })
  if (!admin || !ADMIN_ROLES.includes(admin.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const isPlatform = admin.role === 'PLATFORM_MOD' || admin.role === 'SUPER_ADMIN'

  const mods = await db.user.findMany({
    where: {
      role: 'NEIGHBORHOOD_MOD',
      deletedAt: null,
      ...(isPlatform ? {} : { neighborhoodId: admin.neighborhoodId! }),
    },
    select: {
      id: true,
      name: true,
      lastName: true,
      phone: true,
      avatarUrl: true,
      reputation: true,
      neighborhoodId: true,
      neighborhood: { select: { name: true } },
      modStatus: true,
      modApprovedAt: true,
      lastModActionAt: true,
      modActionsCount: true,
      modReportCount: true,
    },
    take: 500,
  })

  const statusOrder: Record<string, number> = {
    UNDER_REVIEW: 0,
    SUSPENDED: 1,
    INACTIVE: 2,
    ACTIVE: 3,
  }
  mods.sort((a, b) => {
    const sa = statusOrder[a.modStatus] ?? 9
    const sb = statusOrder[b.modStatus] ?? 9
    if (sa !== sb) return sa - sb
    return (b.modReportCount ?? 0) - (a.modReportCount ?? 0)
  })

  return NextResponse.json({ mods })
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'

export const dynamic = 'force-dynamic'

/** Users with a lastSeenAt newer than this many ms ago count as
 *  "active right now". 5 minutes is the WhatsApp-style window —
 *  long enough that a brief loss-of-focus doesn't show the user
 *  drop offline, short enough that the count tracks real
 *  concurrent usage. */
const ACTIVE_WINDOW_MS = 5 * 60 * 1000

/**
 * GET /api/admin/active-users
 *
 * Super-admin only. Returns:
 *   - total active users right now (across the whole platform)
 *   - per-neighborhood breakdown, grouped by city, sorted by
 *     active count desc
 *   - the active threshold (so the client can show "active in
 *     the last 5 min" instead of a hard-coded number)
 *
 * Polled by the admin dashboard ~30s for a live counter — keep
 * the response cheap; we aggregate in SQL via groupBy and a
 * single City+Neighborhood lookup.
 */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  })
  if (!me || !isSuperAdminRole(me.role)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const since = new Date(Date.now() - ACTIVE_WINDOW_MS)

  // groupBy neighborhoodId so we get count-per-hood in one query.
  // Null-hood users (signed up but no hood yet) are excluded from
  // the per-hood breakdown but folded into the platform total.
  const grouped = await db.user.groupBy({
    by: ['neighborhoodId'],
    where: {
      lastSeenAt: { gte: since },
      status: 'ACTIVE',
    },
    _count: { _all: true },
  })

  const totalActive = grouped.reduce((sum, g) => sum + g._count._all, 0)
  const hoodIds = grouped
    .map((g) => g.neighborhoodId)
    .filter((id): id is string => !!id)

  const hoods = hoodIds.length === 0 ? [] : await db.neighborhood.findMany({
    where: { id: { in: hoodIds } },
    select: {
      id: true,
      name: true,
      nameEn: true,
      city: { select: { id: true, name: true, nameEn: true } },
    },
  })
  const hoodById = new Map(hoods.map((h) => [h.id, h] as const))

  // Flatten to neighborhood rows + a derived city aggregation.
  const neighborhoods = grouped
    .filter((g): g is typeof g & { neighborhoodId: string } => !!g.neighborhoodId)
    .map((g) => {
      const h = hoodById.get(g.neighborhoodId)
      return {
        neighborhoodId: g.neighborhoodId,
        neighborhoodName: h?.name ?? null,
        neighborhoodNameEn: h?.nameEn ?? null,
        cityId: h?.city?.id ?? null,
        cityName: h?.city?.name ?? null,
        cityNameEn: h?.city?.nameEn ?? null,
        activeCount: g._count._all,
      }
    })
    .sort((a, b) => b.activeCount - a.activeCount)

  // Roll up to city counts for the higher-level view.
  const cityMap = new Map<string, {
    cityId: string
    cityName: string | null
    cityNameEn: string | null
    activeCount: number
    neighborhoodCount: number
  }>()
  for (const n of neighborhoods) {
    if (!n.cityId) continue
    const existing = cityMap.get(n.cityId)
    if (existing) {
      existing.activeCount += n.activeCount
      existing.neighborhoodCount += 1
    } else {
      cityMap.set(n.cityId, {
        cityId: n.cityId,
        cityName: n.cityName,
        cityNameEn: n.cityNameEn,
        activeCount: n.activeCount,
        neighborhoodCount: 1,
      })
    }
  }
  const cities = Array.from(cityMap.values()).sort((a, b) => b.activeCount - a.activeCount)

  return NextResponse.json({
    totalActive,
    windowMs: ACTIVE_WINDOW_MS,
    cities,
    neighborhoods,
    fetchedAt: new Date().toISOString(),
  })
}

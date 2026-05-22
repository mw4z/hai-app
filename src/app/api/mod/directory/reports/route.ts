import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { gateModRoute } from '@/lib/places/routeGate'

export const dynamic = 'force-dynamic'

/** GET /api/mod/directory/reports
 *  Recent PlaceReport rows for the mod's neighborhood — paginated
 *  by createdAt desc, capped at 50. Each report row joins the
 *  target place (id, name, category, status) so the dashboard can
 *  link straight to the place detail. */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const gate = gateModRoute(user.role)
  if (gate) return gate

  const cross = isSuperAdminRole(user.role) || user.role === 'PLATFORM_MOD'

  const reports = await db.placeReport.findMany({
    where: cross
      ? { status: 'PENDING' }
      : { status: 'PENDING', place: { neighborhoodId: user.neighborhoodId ?? '__none__' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      user: { select: { id: true, name: true } },
      place: {
        select: { id: true, name: true, category: true, status: true, neighborhoodId: true },
      },
    },
  })

  return NextResponse.json({
    reports: reports.map((r) => ({
      id: r.id,
      type: r.type,
      message: r.message,
      createdAt: r.createdAt.toISOString(),
      reporter: r.user,
      place: r.place,
    })),
  })
}

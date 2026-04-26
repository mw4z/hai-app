import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/debug/whoami
 *
 * Returns the calling user's id, role, and neighborhoodId so the
 * admin team can verify in-browser which cohort each mod account is
 * actually in. Useful when diagnosing "why is this admin receiving
 * reports from another neighborhood?" — the answer is almost always
 * one of: their role is SUPER_ADMIN (receives all by design), their
 * neighborhoodId in the DB doesn't match the one you think it does,
 * or you're looking at an old NotifJob that was enqueued before the
 * fan-out was tightened.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      lastName: true,
      role: true,
      status: true,
      neighborhoodId: true,
      neighborhood: { select: { id: true, name: true, nameEn: true } },
    },
  })
  if (!me) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Only SUPER_ADMIN gets the extra admin roster to avoid exposing
  // any sensitive cohort list to regular users.
  let admins: any = null
  if (me.role === 'SUPER_ADMIN') {
    admins = await db.user.findMany({
      where: {
        role: { in: ['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD'] },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        lastName: true,
        role: true,
        neighborhoodId: true,
        neighborhood: { select: { name: true, nameEn: true } },
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })
  }

  return NextResponse.json({ me, admins })
}

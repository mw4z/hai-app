import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true, status: true },
  })
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (user.status === 'BANNED_TEMP' || user.status === 'BANNED_PERM') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const alert = await db.emergencyAlert.findUnique({
    where: { id: params.id },
    select: { id: true, neighborhoodId: true, revokedAt: true },
  })
  if (!alert) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (alert.revokedAt) return NextResponse.json({ ok: true, alreadyRevoked: true })

  if (
    user.role === 'NEIGHBORHOOD_MOD' &&
    alert.neighborhoodId !== user.neighborhoodId
  ) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  await db.emergencyAlert.update({
    where: { id: params.id },
    data: { revokedAt: new Date(), revokedById: session.userId },
  })

  console.log('[EMERGENCY_ALERT] revoked', {
    alertId: params.id,
    by: session.userId,
  })
  return NextResponse.json({ ok: true })
}

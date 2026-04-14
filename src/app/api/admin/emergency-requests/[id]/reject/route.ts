import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']
const MAX_REASON_LEN = 200

/**
 * POST /api/admin/emergency-requests/[id]/reject
 *
 * Mod rejects a pending emergency request. Terminal — the request is
 * marked REJECTED with an optional reason and no alert is created.
 * The requester can see the rejection + reason via /api/emergency/requests/mine.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, status: true, neighborhoodId: true },
  })
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (user.status === 'BANNED_TEMP' || user.status === 'BANNED_PERM') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const raw = (await req.json().catch(() => null)) as { reason?: string } | null
  const reason = String(raw?.reason || '').trim().slice(0, MAX_REASON_LEN) || null

  const request = await db.emergencyAlertRequest.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      neighborhoodId: true,
      status: true,
    },
  })
  if (!request) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (request.status !== 'PENDING') {
    return NextResponse.json(
      { error: 'already_reviewed', status: request.status },
      { status: 409 },
    )
  }
  if (
    user.role === 'NEIGHBORHOOD_MOD' &&
    request.neighborhoodId !== user.neighborhoodId
  ) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  await db.emergencyAlertRequest.update({
    where: { id: request.id },
    data: {
      status: 'REJECTED',
      rejectedReason: reason,
      reviewedById: user.id,
      reviewedAt: new Date(),
    },
  })

  console.log('[EMERGENCY_REQUEST] rejected', {
    requestId: request.id,
    by: user.id,
    reason,
  })

  return NextResponse.json({ ok: true })
}

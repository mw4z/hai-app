import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { resolveSquareLock } from '@/lib/square/lock'

export const dynamic = 'force-dynamic'

/**
 * GET /api/square/lock-status
 *
 * Returns the current lock state for the caller's neighborhood Square.
 * Available to everyone (residents need to know whether the composer
 * should be disabled). Server-side resolution — the client just
 * reads `locked` and renders accordingly.
 */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { neighborhoodId: true },
  })
  if (!me?.neighborhoodId) return NextResponse.json({ error: 'no_neighborhood' }, { status: 404 })

  const hood = await db.neighborhood.findUnique({
    where: { id: me.neighborhoodId },
    select: {
      squareLockedAt: true,
      squareLockedUntil: true,
      squareLockedById: true,
    },
  })
  if (!hood) return NextResponse.json({ error: 'no_neighborhood' }, { status: 404 })

  const state = resolveSquareLock(hood)
  return NextResponse.json({
    isLocked: state.isLocked,
    isScheduled: state.isScheduled,
    lockedAt: state.lockedAt?.toISOString() ?? null,
    lockedUntil: state.lockedUntil?.toISOString() ?? null,
    lockedById: state.lockedById,
  })
}

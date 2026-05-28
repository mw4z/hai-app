import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/square/wipe-my-neighborhood
 *
 * One-shot destructive cleanup tool: HARD DELETES every
 * SquareMessage row in the caller's neighborhood. SquareMessageView
 * has ON DELETE CASCADE so view rows vanish too.
 *
 * Strictly SUPER_ADMIN only — this is a destructive maintenance
 * endpoint, not a user feature. Returns the deleted count so the
 * caller can confirm the wipe happened.
 *
 * Trigger from the browser / Capacitor console:
 *   fetch('/api/admin/square/wipe-my-neighborhood',
 *         { method: 'POST', credentials: 'include' })
 *     .then(r => r.json()).then(console.log)
 */
export async function POST(_req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isSuperAdminRole(me.role)) {
    // SUPER_ADMIN only — surface as 404 so the route stays invisible
    // to anyone probing the API surface.
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (!me.neighborhoodId) {
    return NextResponse.json({ error: 'no_neighborhood' }, { status: 400 })
  }

  const result = await db.squareMessage.deleteMany({
    where: { neighborhoodId: me.neighborhoodId },
  })

  // Audit log so a destructive op leaves a paper trail in Vercel logs.
  console.log('[ADMIN_WIPE_SQUARE]', {
    actorId: me.id,
    neighborhoodId: me.neighborhoodId,
    deleted: result.count,
    ts: new Date().toISOString(),
  })

  return NextResponse.json({
    ok: true,
    neighborhoodId: me.neighborhoodId,
    deleted: result.count,
  })
}

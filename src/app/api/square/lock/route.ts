import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSquareModRole, resolveSquareLock } from '@/lib/square/lock'

export const dynamic = 'force-dynamic'

/**
 * POST /api/square/lock
 *
 * Body: { from?: ISOString, until?: ISOString }
 *
 * Lock the Square chat for residents (admin-only posting). Behaviour:
 *   - No body / { from: null, until: null } → lock NOW, manual unlock.
 *   - { until: ISO } → lock NOW, auto-unlock at the given time.
 *   - { from: ISO, until: ISO } → scheduled lock window.
 *   - { from: ISO } → scheduled lock that has to be manually unlocked.
 *
 * Validation:
 *   - Caller must be a Square moderator (NEIGHBORHOOD_MOD /
 *     PLATFORM_MOD / SUPER_ADMIN). Plain residents get 404.
 *   - `until` must be in the future and after `from`.
 *   - `from` may be past or future; past is treated as "now".
 *
 * DELETE  (or POST with { clear: true }) clears any lock or schedule.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!me?.neighborhoodId) return NextResponse.json({ error: 'no_neighborhood' }, { status: 404 })
  if (!isSquareModRole(me.role)) {
    // Stay invisible to API probing.
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({})) as {
    from?: string | null
    until?: string | null
    clear?: boolean
  }

  if (body?.clear) {
    const updated = await db.neighborhood.update({
      where: { id: me.neighborhoodId },
      data: {
        squareLockedAt: null,
        squareLockedUntil: null,
        squareLockedById: null,
      },
      select: { squareLockedAt: true, squareLockedUntil: true, squareLockedById: true },
    })
    return NextResponse.json({ ok: true, ...resolveSquareLock(updated) })
  }

  const now = new Date()
  let from: Date = now
  let until: Date | null = null

  if (body?.from) {
    const d = new Date(body.from)
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'invalid_from' }, { status: 400 })
    }
    from = d
  }
  if (body?.until) {
    const d = new Date(body.until)
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'invalid_until' }, { status: 400 })
    }
    until = d
  }
  if (until && until.getTime() <= now.getTime()) {
    return NextResponse.json({ error: 'until_in_past' }, { status: 400 })
  }
  if (until && until.getTime() <= from.getTime()) {
    return NextResponse.json({ error: 'until_before_from' }, { status: 400 })
  }

  const updated = await db.neighborhood.update({
    where: { id: me.neighborhoodId },
    data: {
      squareLockedAt: from,
      squareLockedUntil: until,
      squareLockedById: me.id,
    },
    select: { squareLockedAt: true, squareLockedUntil: true, squareLockedById: true },
  })

  return NextResponse.json({ ok: true, ...resolveSquareLock(updated) })
}

export async function DELETE(_req: NextRequest) {
  // Sugar: DELETE is just "clear the lock" without a body.
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!me?.neighborhoodId) return NextResponse.json({ error: 'no_neighborhood' }, { status: 404 })
  if (!isSquareModRole(me.role)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const updated = await db.neighborhood.update({
    where: { id: me.neighborhoodId },
    data: {
      squareLockedAt: null,
      squareLockedUntil: null,
      squareLockedById: null,
    },
    select: { squareLockedAt: true, squareLockedUntil: true, squareLockedById: true },
  })
  return NextResponse.json({ ok: true, ...resolveSquareLock(updated) })
}

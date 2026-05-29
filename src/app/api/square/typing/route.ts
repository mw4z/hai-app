import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSquareTableMissingError } from '@/lib/square/migrationGate'

export const dynamic = 'force-dynamic'

/** Typing signals expire after this many ms. The composer pings
 *  POST every ~2.5s while the user is typing, so a 5s TTL means
 *  the indicator lapses cleanly when they stop. */
const TTL_MS = 5_000

/**
 * POST /api/square/typing
 *
 * The Square composer hits this every ~2.5s while the user has
 * text in the input. Upserts a per-(neighborhood, user) row with
 * expiresAt = now + TTL_MS. When the user stops typing, the row
 * simply expires; no explicit clear required.
 *
 * Returns { ok }. No payload needed — the caller already knows
 * the state they just declared.
 */
export async function POST(_req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { neighborhoodId: true },
  })
  if (!me?.neighborhoodId) return NextResponse.json({ error: 'no_neighborhood' }, { status: 404 })

  const expiresAt = new Date(Date.now() + TTL_MS)
  try {
    await db.squareTypingSignal.upsert({
      where: {
        neighborhoodId_userId: {
          neighborhoodId: me.neighborhoodId,
          userId: session.userId,
        },
      },
      create: {
        neighborhoodId: me.neighborhoodId,
        userId: session.userId,
        expiresAt,
      },
      update: { expiresAt },
    })
  } catch (err) {
    // Brief deploy-before-migration window: the table doesn't exist
    // yet. The feed page already swallows this for messages — do
    // the same here so the composer's 2.5s typing-pings don't 500
    // and spam logs. Once the migration lands, this branch goes
    // unused.
    if (!isSquareTableMissingError(err)) throw err
  }

  return NextResponse.json({ ok: true })
}

/**
 * GET /api/square/typing
 *
 * Returns the list of OTHER users currently typing in the caller's
 * neighborhood. Excludes the caller (they don't need their own
 * indicator), excludes rows whose expiresAt has lapsed.
 *
 * Response:
 *   { users: [{ id, name, lastName }] }
 */
export async function GET(_req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { neighborhoodId: true },
  })
  if (!me?.neighborhoodId) return NextResponse.json({ users: [] })

  const now = new Date()
  let rows: Array<{ userId: string }> = []
  try {
    rows = await db.squareTypingSignal.findMany({
      where: {
        neighborhoodId: me.neighborhoodId,
        expiresAt: { gt: now },
        userId: { not: session.userId },
      },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    })
  } catch (err) {
    // Same table-missing guard as the POST handler — the page polls
    // this every 2s, so any error throws spam logs hard. Empty list
    // is the right fallback (no typing indicator until migration).
    if (isSquareTableMissingError(err)) return NextResponse.json({ users: [] })
    throw err
  }

  if (rows.length === 0) return NextResponse.json({ users: [] })

  const users = await db.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: { id: true, name: true, lastName: true },
  })

  return NextResponse.json({ users })
}

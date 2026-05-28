import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/square/messages/[id]/view → { viewCount }
 *
 * Read-only current count. Polled by visible SquareBubble components
 * so the number bumps "live" as other neighbors view the message.
 * Pauses on the client when the bubble scrolls off-screen / tab hides.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const msg = await db.squareMessage.findUnique({
    where: { id: params.id },
    select: { viewCount: true, status: true },
  })
  if (!msg) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (msg.status !== 'ACTIVE') return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({ viewCount: msg.viewCount })
}

/**
 * POST /api/square/messages/[id]/view
 *
 * Records that the current user has viewed this message. Counted ONCE
 * per (messageId, userId) — the unique index on SquareMessageView
 * makes re-views a no-op. The author's own views aren't counted.
 *
 * Returns { ok, viewCount } so the client can reflect the +1
 * immediately on the bubble.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const msg = await db.squareMessage.findUnique({
    where: { id: params.id },
    select: { id: true, authorId: true, viewCount: true, status: true },
  })
  if (!msg) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (msg.status !== 'ACTIVE') return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Author's own view doesn't increment.
  if (msg.authorId === session.userId) {
    return NextResponse.json({ ok: true, viewCount: msg.viewCount })
  }

  try {
    // skipDuplicates makes the insert race-safe and idempotent: a
    // re-view returns count=0 and we don't bump the counter. Two
    // concurrent first-views both call createMany; the unique index
    // guarantees only one inserts (and only one increments).
    const inserted = await db.squareMessageView.createMany({
      data: [{ messageId: msg.id, userId: session.userId }],
      skipDuplicates: true,
    })
    if (inserted.count === 0) {
      return NextResponse.json({ ok: true, viewCount: msg.viewCount })
    }
    const updated = await db.squareMessage.update({
      where: { id: msg.id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    })
    return NextResponse.json({ ok: true, viewCount: updated.viewCount })
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

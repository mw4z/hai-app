import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/polls/[id]/view → { viewCount }
 *
 * Read-only current count, polled by visible PollCards so the number updates
 * "live" (no websockets; polling pauses when the card is off-screen).
 * Mirrors GET /api/posts/[id]/view.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const poll = await db.poll.findUnique({
    where: { id: params.id },
    select: { viewCount: true },
  })
  if (!poll) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ viewCount: poll.viewCount })
}

/**
 * POST /api/polls/[id]/view
 *
 * Records that the current user viewed this poll. Counted ONCE per user (the
 * unique (pollId, userId) PollView row makes re-views a no-op). The author's
 * own views aren't counted. Mirrors POST /api/posts/[id]/view.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const poll = await db.poll.findUnique({
    where: { id: params.id },
    select: { id: true, authorId: true, viewCount: true },
  })
  if (!poll) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Don't count the author viewing their own poll.
  if (poll.authorId === session.userId) {
    return NextResponse.json({ ok: true, viewCount: poll.viewCount })
  }

  try {
    // First view by this user → insert the row, then bump the counter.
    // createMany({ skipDuplicates }) is a no-op (count: 0) on a re-view and
    // race-safe: concurrent first-views both call it, only one inserts.
    const inserted = await db.pollView.createMany({
      data: [{ pollId: poll.id, userId: session.userId }],
      skipDuplicates: true,
    })
    if (inserted.count === 0) {
      return NextResponse.json({ ok: true, viewCount: poll.viewCount })
    }
    const updated = await db.poll.update({
      where: { id: poll.id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    })
    return NextResponse.json({ ok: true, viewCount: updated.viewCount })
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

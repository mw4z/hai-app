import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

/**
 * POST /api/polls/[id]/comments/[commentId]/pin
 *
 * Toggles a poll comment's pinned state. Only the POLL author or a
 * moderator in scope can pin — mirrors who can moderate the poll. Only
 * top-level comments are pinnable; replies are not.
 *
 * Returns { pinned: boolean } reflecting the new state.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; commentId: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const comment = await db.pollComment.findUnique({
      where: { id: params.commentId },
      select: { id: true, pollId: true, parentId: true, pinnedAt: true },
    })
    if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (comment.pollId !== params.id) return NextResponse.json({ error: 'Mismatch' }, { status: 400 })
    if (comment.parentId) {
      return NextResponse.json({ error: 'لا يمكن تثبيت الردود' }, { status: 400 })
    }

    const [me, poll] = await Promise.all([
      db.user.findUnique({ where: { id: session.userId }, select: { role: true, neighborhoodId: true } }),
      db.poll.findUnique({ where: { id: params.id }, select: { authorId: true, neighborhoodId: true } }),
    ])
    if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const canPin =
      poll.authorId === session.userId ||
      (!!me && (
        me.role === 'SUPER_ADMIN' || me.role === 'PLATFORM_MOD' ||
        (me.role === 'NEIGHBORHOOD_MOD' && poll.neighborhoodId === me.neighborhoodId)
      ))
    if (!canPin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const nextPinned = comment.pinnedAt ? null : new Date()
    await db.pollComment.update({
      where: { id: params.commentId },
      data: { pinnedAt: nextPinned },
      select: { id: true },
    })

    return NextResponse.json({ pinned: !!nextPinned })
  } catch (error) {
    console.error('pin poll comment error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

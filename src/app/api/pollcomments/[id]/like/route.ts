import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { addReputation, REP_POINTS } from '@/lib/reputation'
import { requireUserReady } from '@/lib/requireUserReady'

// POST /api/pollcomments/[id]/like — toggle like on a poll comment/reply.
// Mirrors /api/comments/[id]/like (post comments).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ready = await requireUserReady(session.userId)
  if (!ready.ok) return ready.response

  const comment = await db.pollComment.findUnique({
    where: { id: params.id },
    select: { authorId: true },
  })
  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const existing = await db.pollCommentLike.findUnique({
    where: { pollCommentId_userId: { pollCommentId: params.id, userId: session.userId } },
  })

  if (existing) {
    await db.pollCommentLike.delete({ where: { id: existing.id } })
    return NextResponse.json({ action: 'unliked' })
  }

  await db.pollCommentLike.create({
    data: { pollCommentId: params.id, userId: session.userId },
  })

  // Reputation for the comment author (not self-likes).
  if (comment.authorId !== session.userId) {
    await addReputation({
      userId: comment.authorId,
      fromUserId: session.userId,
      action: 'comment_engaged',
      points: REP_POINTS.comment_engaged,
    }).catch(() => {})
  }

  return NextResponse.json({ action: 'liked' })
}

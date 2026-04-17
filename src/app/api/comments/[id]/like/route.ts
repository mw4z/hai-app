import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { addReputation, REP_POINTS } from '@/lib/reputation'
import { createNotification } from '@/lib/notifications'
import { requireVerified } from '@/lib/requireVerified'

// POST /api/comments/[id]/like — toggle like on a comment/reply
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gate = await requireVerified(session.userId)
  if (gate) return gate

  const comment = await db.comment.findUnique({
    where: { id: params.id },
    select: { authorId: true, postId: true, body: true },
  })
  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Check if already liked
  const existing = await db.commentLike.findUnique({
    where: { commentId_userId: { commentId: params.id, userId: session.userId } },
  })

  if (existing) {
    // Unlike
    await db.commentLike.delete({ where: { id: existing.id } })
    return NextResponse.json({ action: 'unliked' })
  }

  // Like
  await db.commentLike.create({
    data: { commentId: params.id, userId: session.userId },
  })

  // Rep + notification for liked comment
  if (comment.authorId !== session.userId) {
    await addReputation({
      userId: comment.authorId,
      fromUserId: session.userId,
      action: 'comment_engaged',
      points: REP_POINTS.comment_engaged,
    })

    const sender = await db.user.findUnique({ where: { id: session.userId }, select: { name: true } })
    createNotification({
      type: 'REACTION_ON_POST',
      userId: comment.authorId,
      actorId: session.userId,
      actorName: sender?.name || undefined,
      postId: comment.postId,
      postTitle: comment.body?.slice(0, 50) || undefined,
    })
  }

  return NextResponse.json({ action: 'liked' })
}

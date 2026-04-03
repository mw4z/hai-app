import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

/** DELETE — Delete a poll (author or super admin only) */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const poll = await db.poll.findUnique({ where: { id: params.id }, select: { authorId: true } })
  if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (poll.authorId !== session.userId && user?.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Delete votes, comments, reactions, then poll
  await db.pollVote.deleteMany({ where: { pollId: params.id } })
  await db.pollComment.deleteMany({ where: { pollId: params.id } })
  await db.pollReaction.deleteMany({ where: { pollId: params.id } })
  await db.poll.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}

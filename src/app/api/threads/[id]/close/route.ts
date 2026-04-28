import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { addReputation, REP_POINTS } from '@/lib/reputation'
import { createNotification } from '@/lib/notifications'
import { fullName } from '@/lib/displayName'

// POST /api/threads/[id]/close — close a thread
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const thread = await db.thread.findUnique({
    where: { id: params.id },
    select: { user1Id: true, user2Id: true, postId: true, status: true },
  })
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (thread.user1Id !== session.userId && thread.user2Id !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (thread.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Already closed' }, { status: 400 })
  }

  await db.thread.update({
    where: { id: params.id },
    data: { status: 'CLOSED', closedBy: session.userId },
  })

  // Notify the other person that the thread was closed
  const otherId = thread.user1Id === session.userId ? thread.user2Id : thread.user1Id
  const closer = await db.user.findUnique({ where: { id: session.userId }, select: { name: true, lastName: true } })
  await db.notification.create({
    data: {
      type: 'NEW_MESSAGE',
      userId: otherId,
      actorId: session.userId,
      actorName: fullName(closer) || closer?.name || undefined,
      postTitle: 'تم إنهاء المحادثة',
      threadId: params.id,
    },
  }).catch(() => {}) // the thread is closed so link won't work, but notification still shows

  // Rep rewards for completed coordination
  if (thread.postId) {
    const post = await db.post.findUnique({
      where: { id: thread.postId },
      select: { activeThreadId: true, coordinationMode: true, authorId: true, newCategory: true },
    })

    if (post?.activeThreadId === params.id) {
      await db.post.update({
        where: { id: thread.postId },
        data: { activeThreadId: null, status: 'ACTIVE' },
      })
    }

    // Only reward for exclusive coordination (rides, services) — not casual chats
    // Points come from the RATING step, not from closing
    if (post?.coordinationMode === 'EXCLUSIVE') {
      const msgCount = await db.message.count({ where: { threadId: params.id } })
      if (msgCount >= 3) {
        const isRide = post?.newCategory === 'RIDES'
        const action = isRide ? 'ride_completed' : 'service_completed'
        const halfPoints = Math.floor((isRide ? REP_POINTS.ride_completed : REP_POINTS.service_completed) / 2)

        // Small bonus for completing coordination — full points come from positive rating
        const helperId = post!.authorId === thread.user1Id ? thread.user2Id : thread.user1Id
        await addReputation({ userId: helperId, fromUserId: post!.authorId, action, points: halfPoints, postId: thread.postId! })
      }
    }
  }

  return NextResponse.json({ success: true })
}

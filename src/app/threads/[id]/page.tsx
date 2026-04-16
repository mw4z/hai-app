import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import ChatClient from './ChatClient'

export default async function ThreadPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const thread = await db.thread.findUnique({
    where: { id: params.id },
    include: {
      user1: { select: { id: true, name: true, avatarUrl: true } },
      user2: { select: { id: true, name: true, avatarUrl: true } },
    },
  })

  if (!thread) redirect('/threads')
  if (thread.user1Id !== session.userId && thread.user2Id !== session.userId) redirect('/threads')

  // If closed, check if user already rated — if yes, redirect away
  if (thread.status === 'CLOSED') {
    const otherId = thread.user1Id === session.userId ? thread.user2Id : thread.user1Id
    const alreadyRated = await db.reputationLog.findFirst({
      where: {
        userId: otherId,
        fromUserId: session.userId,
        action: { in: ['positive_rating', 'negative_rating', 'neutral_rating'] },
      },
    })
    if (alreadyRated) redirect('/threads') // already rated, nothing to do
  }

  // Only allow ACTIVE or CLOSED (for rating)
  if (thread.status !== 'ACTIVE' && thread.status !== 'CLOSED') redirect('/threads')

  const other = thread.user1Id === session.userId ? thread.user2 : thread.user1

  const messages = await db.message.findMany({
    where: { threadId: params.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, type: true, text: true, lat: true, lng: true,
      imageUrl: true, senderId: true, createdAt: true,
      deliveredAt: true, readAt: true, edited: true, reactions: true,
      replyToId: true,
      replyTo: { select: { id: true, text: true, senderId: true, type: true } },
    },
    take: 100,
  })

  // Mark other user's messages as read on page load
  const unreadIds = messages
    .filter(m => m.senderId !== session.userId && !m.readAt)
    .map(m => m.id)
  if (unreadIds.length > 0) {
    await db.message.updateMany({
      where: { id: { in: unreadIds } },
      data: { readAt: new Date(), deliveredAt: new Date() },
    })
  }

  // Check if current user is the post author (only author can rate)
  let isPostAuthor = false
  if (thread.postId) {
    const post = await db.post.findUnique({ where: { id: thread.postId }, select: { authorId: true } })
    isPostAuthor = post?.authorId === session.userId
  }

  return (
    <ChatClient
      threadId={params.id}
      currentUserId={session.userId}
      other={JSON.parse(JSON.stringify(other))}
      initialMessages={JSON.parse(JSON.stringify(messages))}
      isClosed={thread.status === 'CLOSED'}
      canRate={isPostAuthor}
    />
  )
}

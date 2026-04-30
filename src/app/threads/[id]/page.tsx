import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import ChatClient from './ChatClient'

// Never serve this page from the Router Cache. Without this, the
// Android WebView was re-using a previous render of the thread when
// the user navigated back-then-in, which dropped any message the
// user sent between those navigations until the 3s poll caught up —
// the 'message disappears then comes back' symptom.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ThreadPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  // Thread metadata + the first 100 messages can be fetched in
  // parallel — messages doesn't depend on the thread row, both key
  // off params.id. Saves a full DB roundtrip on every chat open.
  const [thread, messages] = await Promise.all([
    db.thread.findUnique({
      where: { id: params.id },
      include: {
        user1: { select: { id: true, name: true, lastName: true, avatarUrl: true, role: true } },
        user2: { select: { id: true, name: true, lastName: true, avatarUrl: true, role: true } },
      },
    }),
    db.message.findMany({
      where: { threadId: params.id, NOT: { hiddenBy: { has: session.userId } } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, type: true, text: true, lat: true, lng: true,
        imageUrl: true, senderId: true, createdAt: true,
        deliveredAt: true, readAt: true, edited: true, reactions: true,
        replyToId: true,
        replyTo: { select: { id: true, text: true, senderId: true, type: true } },
      },
      take: 100,
    }),
  ])

  if (!thread) redirect('/threads')
  if (thread.user1Id !== session.userId && thread.user2Id !== session.userId) redirect('/threads')

  // Side-effects + secondary checks — also parallel. The post-author
  // rating gate, the unread-update, and the already-rated check all
  // run independently and don't block each other.
  const otherId = thread.user1Id === session.userId ? thread.user2Id : thread.user1Id
  const unreadIds = messages
    .filter(m => m.senderId !== session.userId && !m.readAt)
    .map(m => m.id)

  const [, alreadyRated, postAuthorCheck] = await Promise.all([
    unreadIds.length > 0
      ? db.message.updateMany({
          where: { id: { in: unreadIds } },
          data: { readAt: new Date(), deliveredAt: new Date() },
        })
      : Promise.resolve(null),
    thread.status === 'CLOSED'
      ? db.reputationLog.findFirst({
          where: {
            userId: otherId,
            fromUserId: session.userId,
            action: { in: ['positive_rating', 'negative_rating', 'neutral_rating'] },
          },
          select: { id: true },
        })
      : Promise.resolve(null),
    thread.postId
      ? db.post.findUnique({
          where: { id: thread.postId },
          select: { authorId: true },
        })
      : Promise.resolve(null),
  ])

  if (thread.status === 'CLOSED' && alreadyRated) redirect('/threads')
  if (thread.status !== 'ACTIVE' && thread.status !== 'CLOSED') redirect('/threads')

  const other = thread.user1Id === session.userId ? thread.user2 : thread.user1
  const isPostAuthor = postAuthorCheck?.authorId === session.userId

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

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { cached } from '@/lib/cache'
import ThreadsClient from './ThreadsClient'

export default async function ThreadsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Run the "mark NEW_MESSAGE notifications read" write in parallel
  // with the threads read. The notification update doesn't gate the
  // page render — both queries can complete independently. Awaited
  // (not fire-and-forget) so the function doesn't recycle before the
  // write commits, but parallelized so the slower of the two is the
  // page's effective latency, not their sum.
  const [, threads, currentUser] = await Promise.all([
    db.notification.updateMany({
      where: { userId: session.userId, read: false, type: 'NEW_MESSAGE' },
      data: { read: true },
    }),
    cached(`threads:${session.userId}`, 15_000, () =>
      db.thread.findMany({
        where: {
          status: 'ACTIVE',
          OR: [{ user1Id: session.userId }, { user2Id: session.userId }],
        },
        include: {
          user1: { select: { id: true, name: true, lastName: true, avatarUrl: true, showReadReceipts: true, neighborhoodId: true } },
          user2: { select: { id: true, name: true, lastName: true, avatarUrl: true, showReadReceipts: true, neighborhoodId: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              text: true, type: true, createdAt: true, senderId: true,
              deliveredAt: true, readAt: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      })
    ),
    db.user.findUnique({
      where: { id: session.userId },
      select: { neighborhoodId: true },
    }),
  ])

  // Look up related post titles for context
  const postIds = threads.map(t => t.postId).filter(Boolean) as string[]
  const threadIds = threads.map(t => t.id)
  const [posts, unreadGrouped] = await Promise.all([
    postIds.length > 0
      ? cached(`thread-posts:${session.userId}`, 30_000, () =>
          db.post.findMany({
            where: { id: { in: postIds } },
            select: { id: true, title: true, category: true, coordinationMode: true },
          })
        )
      : Promise.resolve([] as { id: string; title: string; category: string; coordinationMode: string }[]),
    // Unread count per thread = messages where the OTHER user is the
    // sender and readAt is still null. One groupBy keeps the cost flat
    // regardless of how many threads / messages exist.
    threadIds.length > 0
      ? db.message.groupBy({
          by: ['threadId'],
          where: {
            threadId: { in: threadIds },
            senderId: { not: session.userId },
            readAt: null,
          },
          _count: { _all: true },
        })
      : Promise.resolve([] as Array<{ threadId: string; _count: { _all: number } }>),
  ])
  const postMap = new Map(posts.map(p => [p.id, p]))
  const unreadByThread = new Map(unreadGrouped.map(g => [g.threadId, g._count._all]))

  const formatted = threads.map(t => {
    const other = t.user1Id === session.userId ? t.user2 : t.user1
    const lastMsg = t.messages[0] || null
    const post = t.postId ? postMap.get(t.postId) : null
    const isMe = lastMsg ? lastMsg.senderId === session.userId : false
    const readAtSafe = isMe && lastMsg?.readAt && other?.showReadReceipts
      ? lastMsg.readAt.toISOString()
      : null
    return {
      id: t.id,
      other: { id: other.id, name: other.name, lastName: other.lastName, avatarUrl: other.avatarUrl, neighborhoodId: other.neighborhoodId },
      postTitle: post?.title?.slice(0, 40) || null,
      postCategory: post?.category || null,
      isExclusive: post?.coordinationMode === 'EXCLUSIVE',
      unreadCount: unreadByThread.get(t.id) || 0,
      lastMessage: lastMsg ? {
        text: lastMsg.type === 'LOCATION' ? '📍' : (lastMsg.text?.slice(0, 50) || ''),
        isMe,
        createdAt: lastMsg.createdAt.toISOString(),
        deliveredAt: isMe && lastMsg.deliveredAt ? lastMsg.deliveredAt.toISOString() : null,
        readAt: readAtSafe,
      } : null,
    }
  })

  return (
    <ThreadsClient
      threads={JSON.parse(JSON.stringify(formatted))}
      currentUserNeighborhoodId={currentUser?.neighborhoodId || null}
    />
  )
}

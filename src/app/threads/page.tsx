import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { cached } from '@/lib/cache'
import ThreadsClient from './ThreadsClient'

export default async function ThreadsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Fire-and-forget mark-as-read. Previously awaited, which added an
  // extra DB round-trip to the time-to-first-paint of /threads. The
  // bell counter on the next page load picks up the change either way.
  db.notification.updateMany({
    where: { userId: session.userId, read: false, type: 'NEW_MESSAGE' },
    data: { read: true },
  }).catch(() => {})

  // Threads + a probe of postIds in parallel. The post-titles fetch
  // can't actually start until we know which postIds to fetch, but we
  // can still cut latency by reading from the threads cache + post
  // cache concurrently when both are warm. When threads aren't cached,
  // the postIds depend on threads so we await sequentially.
  const threads = await cached(`threads:${session.userId}`, 15_000, () =>
    db.thread.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ user1Id: session.userId }, { user2Id: session.userId }],
      },
      include: {
        user1: { select: { id: true, name: true, avatarUrl: true, showReadReceipts: true } },
        user2: { select: { id: true, name: true, avatarUrl: true, showReadReceipts: true } },
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
  )

  // Look up related post titles for context. Cached for 60s now —
  // post titles rarely change after the thread is created.
  const postIds = threads.map(t => t.postId).filter(Boolean) as string[]
  const posts = postIds.length > 0
    ? await cached(`thread-posts:${session.userId}`, 60_000, () =>
        db.post.findMany({
          where: { id: { in: postIds } },
          select: { id: true, title: true, category: true, coordinationMode: true },
        })
      )
    : []
  const postMap = new Map(posts.map(p => [p.id, p]))

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
      other: { id: other.id, name: other.name, avatarUrl: other.avatarUrl },
      postTitle: post?.title?.slice(0, 40) || null,
      postCategory: post?.category || null,
      isExclusive: post?.coordinationMode === 'EXCLUSIVE',
      lastMessage: lastMsg ? {
        text: lastMsg.type === 'LOCATION' ? '📍' : (lastMsg.text?.slice(0, 50) || ''),
        isMe,
        createdAt: lastMsg.createdAt.toISOString(),
        deliveredAt: isMe && lastMsg.deliveredAt ? lastMsg.deliveredAt.toISOString() : null,
        readAt: readAtSafe,
      } : null,
    }
  })

  return <ThreadsClient threads={JSON.parse(JSON.stringify(formatted))} />
}

import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import MyPostsClient from './MyPostsClient'

export const dynamic = 'force-dynamic'

/** "منشوراتي" — all of the current user's posts in one place to view +
 *  manage (delete / open). SSR'd so the list is present on first paint. */
export default async function MyPostsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const posts = await db.post.findMany({
    // Everything the user authored except mod-removed rows.
    where: { authorId: session.userId, status: { not: 'REMOVED' } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, title: true, body: true, category: true, status: true,
      createdAt: true, imageUrls: true,
      _count: { select: { comments: true, reactions: true } },
    },
  })

  return <MyPostsClient posts={JSON.parse(JSON.stringify(posts))} />
}

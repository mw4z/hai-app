import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { requireUserReady } from '@/lib/requireUserReady'

export const dynamic = 'force-dynamic'

/**
 * Follow / unfollow a post. Interest tracking only — not engagement.
 * Subscribers receive new-comment pushes (rate-limited; see
 * /api/posts/[id]/comments) and a bell row every time.
 *
 * POST   → subscribe
 * DELETE → unsubscribe
 *
 * Both are idempotent: re-following a post you already follow is a
 * no-op 200, unfollowing one you don't follow is a no-op 200 too.
 * Authors cannot subscribe to their own post (already get every
 * comment notification via the author path).
 */

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Profile-only — subscriptions don't surface name; location not needed.
  const ready = await requireUserReady(session.userId, { requireProfile: true, requireLocation: false })
  if (!ready.ok) return ready.response

  const post = await db.post.findUnique({
    where: { id: params.id },
    select: { id: true, authorId: true, status: true },
  })
  if (!post) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (post.status === 'REMOVED') return NextResponse.json({ error: 'post_removed' }, { status: 410 })
  if (post.authorId === session.userId) {
    // Silent no-op — authors implicitly follow their own posts, no row needed.
    return NextResponse.json({ ok: true, following: true, author: true })
  }

  try {
    await db.postSubscription.create({
      data: { postId: params.id, userId: session.userId },
    })
  } catch {
    // P2002 unique violation — already subscribed. Treat as success.
  }
  return NextResponse.json({ ok: true, following: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  await db.postSubscription.deleteMany({
    where: { postId: params.id, userId: session.userId },
  })
  return NextResponse.json({ ok: true, following: false })
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/posts/[id]/view → { viewCount }
 *
 * Read-only current count, polled by visible PostCards so the number
 * updates "live" as other users view (no websocket infra in the app;
 * polling pauses when the card is off-screen / tab hidden).
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const post = await db.post.findUnique({
    where: { id: params.id },
    select: { viewCount: true },
  })
  if (!post) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ viewCount: post.viewCount })
}

/**
 * POST /api/posts/[id]/view
 *
 * Records that the current user has viewed this post. Counted ONCE
 * per user: the unique (postId, userId) PostView row means a re-view
 * (user scrolls back / reopens) is a no-op and never re-increments.
 * The author's own views aren't counted.
 *
 * Returns { ok, viewCount } — the post's current distinct-viewer
 * count so the client can reflect it (incl. the +1 from a first view).
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const post = await db.post.findUnique({
    where: { id: params.id },
    select: { id: true, authorId: true, viewCount: true },
  })
  if (!post) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Don't count the author viewing their own post.
  if (post.authorId === session.userId) {
    return NextResponse.json({ ok: true, viewCount: post.viewCount })
  }

  try {
    // First view by this user → create the row + bump the counter
    // atomically. The unique constraint makes a re-view throw P2002,
    // which we treat as "already counted".
    const [, updated] = await db.$transaction([
      db.postView.create({ data: { postId: post.id, userId: session.userId } }),
      db.post.update({
        where: { id: post.id },
        data: { viewCount: { increment: 1 } },
        select: { viewCount: true },
      }),
    ])
    return NextResponse.json({ ok: true, viewCount: updated.viewCount })
  } catch (err: any) {
    // Already viewed (unique violation) — return the unchanged count.
    if (err?.code === 'P2002') {
      return NextResponse.json({ ok: true, viewCount: post.viewCount })
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

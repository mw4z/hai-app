import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

/**
 * POST /api/posts/[id]/comments/[commentId]/pin
 *
 * Toggles a comment's pinned state. Only the POST author (the creator of
 * the thread) or a moderator in scope can pin — mirrors who can moderate
 * the post. Only top-level comments are pinnable; replies are not.
 *
 * Returns { pinned: boolean } reflecting the new state.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; commentId: string } },
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const comment = await db.comment.findUnique({
      where: { id: params.commentId },
      select: { id: true, postId: true, parentId: true, pinnedAt: true },
    })
    if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (comment.postId !== params.id) return NextResponse.json({ error: 'Mismatch' }, { status: 400 })
    if (comment.parentId) {
      return NextResponse.json({ error: 'لا يمكن تثبيت الردود' }, { status: 400 })
    }

    const [me, post] = await Promise.all([
      db.user.findUnique({ where: { id: session.userId }, select: { role: true, neighborhoodId: true } }),
      db.post.findUnique({ where: { id: params.id }, select: { authorId: true, neighborhoodId: true } }),
    ])
    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const canPin =
      post.authorId === session.userId ||
      (!!me && (
        me.role === 'SUPER_ADMIN' || me.role === 'PLATFORM_MOD' ||
        (me.role === 'NEIGHBORHOOD_MOD' && post.neighborhoodId === me.neighborhoodId)
      ))
    if (!canPin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const nextPinned = comment.pinnedAt ? null : new Date()
    await db.comment.update({
      where: { id: params.commentId },
      data: { pinnedAt: nextPinned },
      select: { id: true },
    })

    return NextResponse.json({ pinned: !!nextPinned })
  } catch (error) {
    console.error('pin comment error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

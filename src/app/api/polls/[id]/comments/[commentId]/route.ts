import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { moderateContent } from '@/lib/moderation'

const EDIT_WINDOW = 30 * 60_000 // 30 minutes

// DELETE /api/polls/[id]/comments/[commentId]
// Author can delete their own; mods/admins can remove others in scope
// (PLATFORM_MOD / SUPER_ADMIN anywhere; NEIGHBORHOOD_MOD in their hood).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; commentId: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const comment = await db.pollComment.findUnique({
      where: { id: params.commentId },
      select: { authorId: true, pollId: true },
    })
    if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (comment.pollId !== params.id) return NextResponse.json({ error: 'Mismatch' }, { status: 400 })

    if (comment.authorId !== session.userId) {
      const [me, poll] = await Promise.all([
        db.user.findUnique({ where: { id: session.userId }, select: { role: true, neighborhoodId: true } }),
        db.poll.findUnique({ where: { id: comment.pollId }, select: { neighborhoodId: true } }),
      ])
      const canModerate = !!me && (
        me.role === 'SUPER_ADMIN' || me.role === 'PLATFORM_MOD' ||
        (me.role === 'NEIGHBORHOOD_MOD' && !!poll && poll.neighborhoodId === me.neighborhoodId)
      )
      if (!canModerate) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Replies + likes cascade at the DB (onDelete: Cascade).
    await db.pollComment.delete({ where: { id: params.commentId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('delete poll comment error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH /api/polls/[id]/comments/[commentId] — edit own comment within 30 min.
export async function PATCH(req: NextRequest, { params }: { params: { id: string; commentId: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const comment = await db.pollComment.findUnique({
      where: { id: params.commentId },
      select: { authorId: true, pollId: true, createdAt: true },
    })
    if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (comment.pollId !== params.id) return NextResponse.json({ error: 'Mismatch' }, { status: 400 })
    if (comment.authorId !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (Date.now() - new Date(comment.createdAt).getTime() > EDIT_WINDOW) {
      return NextResponse.json({ error: 'انتهت مهلة التعديل' }, { status: 403 })
    }

    const { body } = await req.json()
    if (!body?.trim() || body.trim().length < 2) return NextResponse.json({ error: 'التعليق قصير جداً' }, { status: 400 })
    if (body.length > 500) return NextResponse.json({ error: 'التعليق طويل جداً' }, { status: 400 })

    const mod = moderateContent(body.trim())
    if (mod.action === 'block') {
      return NextResponse.json({ error: mod.reason || 'تم حظر المحتوى' }, { status: 403 })
    }

    const updated = await db.pollComment.update({
      where: { id: params.commentId },
      data: { body: mod.censored, editedAt: new Date() },
      select: { id: true, body: true, editedAt: true },
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('edit poll comment error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

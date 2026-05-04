import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { moderateContent } from '@/lib/moderation'
import { cleanupNotificationsFor } from '@/lib/notifications'

const EDIT_WINDOW = 30 * 60_000 // 30 minutes

// DELETE /api/posts/[id]/comments/[commentId]
export async function DELETE(req: NextRequest, { params }: { params: { id: string; commentId: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const comment = await db.comment.findUnique({
      where: { id: params.commentId },
      select: { authorId: true, postId: true, createdAt: true },
    })

    if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (comment.postId !== params.id) return NextResponse.json({ error: 'Mismatch' }, { status: 400 })
    if (comment.authorId !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Collect reply IDs first so we can clean up notifications that
    // referenced them too — Prisma cascades delete the rows but
    // doesn't touch Notification.commentId.
    const replies = await db.comment.findMany({
      where: { parentId: params.commentId },
      select: { id: true },
    })
    await db.comment.deleteMany({ where: { parentId: params.commentId } })
    await db.comment.delete({ where: { id: params.commentId } })

    // Clear bell rows that pointed at this comment OR any of its
    // replies. Run as Promise.all so a slow one doesn't block the
    // response. Errors are non-fatal — notification cleanup is
    // best-effort, the delete itself is the user-visible action.
    await Promise.all([
      cleanupNotificationsFor({ commentId: params.commentId }),
      ...replies.map(r => cleanupNotificationsFor({ commentId: r.id })),
    ]).catch(() => { /* non-fatal */ })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('delete comment error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH /api/posts/[id]/comments/[commentId]
export async function PATCH(req: NextRequest, { params }: { params: { id: string; commentId: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const comment = await db.comment.findUnique({
      where: { id: params.commentId },
      select: { authorId: true, postId: true, createdAt: true },
    })

    if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (comment.postId !== params.id) return NextResponse.json({ error: 'Mismatch' }, { status: 400 })
    if (comment.authorId !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (Date.now() - new Date(comment.createdAt).getTime() > EDIT_WINDOW) {
      return NextResponse.json({ error: 'انتهت مهلة التعديل' }, { status: 403 })
    }

    const { body } = await req.json()
    if (!body?.trim() || body.trim().length < 2) return NextResponse.json({ error: 'التعليق قصير جداً' }, { status: 400 })
    if (body.length > 500) return NextResponse.json({ error: 'التعليق طويل جداً' }, { status: 400 })

    // Profanity check
    const mod = moderateContent(body.trim())
    if (mod.action === 'block') {
      return NextResponse.json({ error: mod.reason || 'تم حظر المحتوى' }, { status: 403 })
    }

    const updated = await db.comment.update({
      where: { id: params.commentId },
      data: { body: mod.censored, editedAt: new Date() },
      include: {
        author: { select: { id: true, name: true, lastName: true, reputation: true, accountType: true, providerStatus: true } },
        likes: { select: { userId: true } },
        _count: { select: { likes: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('edit comment error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

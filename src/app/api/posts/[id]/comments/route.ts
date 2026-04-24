import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { createNotification } from '@/lib/notifications'
import { apiError } from '@/lib/validation'
import { moderateContent } from '@/lib/moderation'
import { requireVerified } from '@/lib/requireVerified'
import { kickNotifCron } from '@/lib/kickNotifCron'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const comments = await db.comment.findMany({
    where: { postId: params.id, parentId: null },
    include: {
      author: { select: { id: true, name: true, reputation: true, accountType: true, providerStatus: true, avatarUrl: true } },
      likes: { select: { userId: true } },
      _count: { select: { likes: true } },
      replies: {
        include: {
          author: { select: { id: true, name: true, reputation: true, accountType: true, providerStatus: true, avatarUrl: true } },
          likes: { select: { userId: true } },
          _count: { select: { likes: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    // editedAt is auto-included (no select used on Comment)
    orderBy: { createdAt: 'asc' },
    take: 50,
  })

  // Format: add likeCount + isLiked for easier client use
  const formatted = comments.map(c => ({
    ...c,
    likeCount: c._count.likes,
    isLiked: c.likes.some(l => l.userId === session.userId),
    replies: c.replies.map((r: any) => ({
      ...r,
      likeCount: r._count.likes,
      isLiked: r.likes.some((l: any) => l.userId === session.userId),
    })),
  }))

  return NextResponse.json(formatted)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const gate = await requireVerified(session.userId)
  if (gate) return gate

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { status: true, neighborhoodId: true, role: true },
  })
  const bypass = isSuperAdminRole(user?.role)

  if (!bypass && (user?.status === 'BANNED_TEMP' || user?.status === 'BANNED_PERM')) {
    return NextResponse.json({ error: 'حسابك موقوف' }, { status: 403 })
  }

  // Neighborhood isolation: verify post belongs to user's neighborhood
  const post = await db.post.findUnique({
    where: { id: params.id },
    select: { authorId: true, title: true, neighborhoodId: true },
  })
  if (!post) return NextResponse.json({ error: 'المنشور غير موجود' }, { status: 404 })
  if (!bypass && post.neighborhoodId !== user?.neighborhoodId) {
    return NextResponse.json({ error: 'لا يمكنك التعليق على منشورات حي آخر' }, { status: 403 })
  }

  if (!bypass) {
    // Rate limit: max 10 comments per minute
    const oneMinuteAgo = new Date(Date.now() - 60_000)
    const recentComments = await db.comment.count({
      where: { authorId: session.userId, createdAt: { gte: oneMinuteAgo } },
    })
    if (recentComments >= 10) {
      console.log(`[RATE_LIMIT] comments: user=${session.userId}, count=${recentComments}`)
      return NextResponse.json(apiError('حاول مجدداً بعد قليل', 429), { status: 429 })
    }
  }

  const { body, parentId, imageUrl } = await req.json()
  const hasText = !!body?.trim() && body.trim().length >= 2
  const hasImage = typeof imageUrl === 'string' && imageUrl.startsWith('https://') && imageUrl.length < 500

  if (!hasText && !hasImage) {
    return NextResponse.json({ error: 'التعليق فارغ' }, { status: 400 })
  }
  if (body && body.length > 500) return NextResponse.json({ error: 'التعليق طويل جداً' }, { status: 400 })

  // Verify parentId belongs to this post
  let parentComment: { postId: string; authorId: string } | null = null
  if (parentId) {
    parentComment = await db.comment.findUnique({
      where: { id: parentId },
      select: { postId: true, authorId: true },
    })
    if (!parentComment || parentComment.postId !== params.id) {
      return NextResponse.json({ error: 'تعليق غير صالح' }, { status: 400 })
    }
  }

  // ── Profanity check (skip when image-only, and skip entirely for
  //    SUPER_ADMIN — they bypass moderation) ─────────────────────────
  let censoredBody = ''
  if (hasText) {
    if (bypass) {
      censoredBody = body.trim()
    } else {
      const mod = moderateContent(body.trim())
      if (mod.action === 'block') {
        return NextResponse.json(apiError(mod.reason || 'تم حظر التعليق', 403), { status: 403 })
      }
      if (mod.reputationPenalty < 0) {
        db.user.update({
          where: { id: session.userId },
          data: { reputation: { increment: mod.reputationPenalty } },
        }).catch(() => {})
        db.notification.create({
          data: {
            type: 'SYSTEM',
            userId: session.userId,
            actorId: session.userId,
            actorName: 'النظام',
            postTitle: `تم خصم ${Math.abs(mod.reputationPenalty)} نقطة سمعة بسبب تعليق مخالف`,
          },
        }).catch(() => {})
      }
      censoredBody = mod.censored
    }
  }

  const comment = await db.comment.create({
    data: {
      postId: params.id,
      authorId: session.userId,
      body: censoredBody,
      imageUrl: hasImage ? imageUrl : null,
      parentId: parentId || null,
    },
    include: {
      author: { select: { id: true, name: true, reputation: true, accountType: true, providerStatus: true, avatarUrl: true } },
      replies: { include: { author: { select: { id: true, name: true, reputation: true } } } },
    },
  })

  // Notifications
  if (parentId && parentComment) {
    await createNotification({
      type: 'REPLY_TO_COMMENT',
      userId: parentComment.authorId,
      actorId: session.userId,
      actorName: comment.author.name || undefined,
      postId: params.id,
      postTitle: post.title.slice(0, 80),
      commentId: comment.id,
    })
  } else {
    await createNotification({
      type: 'COMMENT_ON_POST',
      userId: post.authorId,
      actorId: session.userId,
      actorName: comment.author.name || undefined,
      postId: params.id,
      postTitle: post.title.slice(0, 80),
      commentId: comment.id,
    })
  }

  // ── Push notification enqueue (fire-and-forget) ────────────────────
  // Reply path is exclusive: never enqueue comment_on_post for a reply.
  const actorNameForPush = comment.author?.name || null
  const pushSnippet = (censoredBody || '').slice(0, 120)

  if (parentId && parentComment) {
    const recipientId = parentComment.authorId
    if (recipientId !== session.userId) {
      db.notifJob.create({
        data: {
          type: 'reply_to_comment',
          priority: 'normal',
          targetType: 'user',
          targetRef: recipientId,
          payload: {
            postId: params.id,
            commentId: comment.id,
            parentCommentId: parentId,
            actorId: session.userId,
            actorName: actorNameForPush,
            recipientId,
            snippet: pushSnippet,
          },
        },
      }).catch((err) => {
        console.error('[NOTIF_JOB] enqueue reply_to_comment failed:', err)
      })
      kickNotifCron()
    }
  } else if (post.authorId !== session.userId) {
    db.notifJob.create({
      data: {
        type: 'comment_on_post',
        priority: 'normal',
        targetType: 'user',
        targetRef: post.authorId,
        payload: {
          postId: params.id,
          commentId: comment.id,
          actorId: session.userId,
          actorName: actorNameForPush,
          postAuthorId: post.authorId,
          snippet: pushSnippet,
        },
      },
    }).catch((err) => {
      console.error('[NOTIF_JOB] enqueue comment_on_post failed:', err)
    })
    kickNotifCron()
  }

  return NextResponse.json(comment)
}

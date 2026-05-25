import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { createNotification } from '@/lib/notifications'
import { apiError } from '@/lib/validation'
import { moderateContent } from '@/lib/moderation'
import { requireUserReady } from '@/lib/requireUserReady'
import { kickNotifCron } from '@/lib/kickNotifCron'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { fullName } from '@/lib/displayName'
import { parseStickerRef, toStickerRef } from '@/lib/stickers/catalog'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  // Post author drives both the "OP" badge and the creator-first sort.
  const postRow = await db.post.findUnique({
    where: { id: params.id },
    select: { authorId: true },
  })
  const postAuthorId = postRow?.authorId ?? null

  const comments = await db.comment.findMany({
    where: { postId: params.id, parentId: null },
    include: {
      author: { select: { id: true, name: true, lastName: true, reputation: true, accountType: true, providerStatus: true, avatarUrl: true, coverUrl: true, role: true, gender: true, createdAt: true, bio: true, serviceDescription: true, serviceAddress: true, serviceLat: true, serviceLng: true, neighborhood: { select: { name: true, nameEn: true } }, _count: { select: { posts: true } } } },
      likes: { select: { userId: true } },
      _count: { select: { likes: true } },
      replies: {
        include: {
          author: { select: { id: true, name: true, lastName: true, reputation: true, accountType: true, providerStatus: true, avatarUrl: true, coverUrl: true, role: true, gender: true, createdAt: true, bio: true, serviceDescription: true, serviceAddress: true, serviceLat: true, serviceLng: true, neighborhood: { select: { name: true, nameEn: true } }, _count: { select: { posts: true } } } },
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

  // Order top-level comments: pinned first (newest pin on top), then the
  // post creator's own comments, then everyone else oldest-first.
  const rank = (c: any) => (c.pinnedAt ? 0 : c.author?.id === postAuthorId ? 1 : 2)
  formatted.sort((a, b) => {
    const ra = rank(a), rb = rank(b)
    if (ra !== rb) return ra - rb
    if (ra === 0) return (b.pinnedAt ? +new Date(b.pinnedAt) : 0) - (a.pinnedAt ? +new Date(a.pinnedAt) : 0)
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  return NextResponse.json(formatted)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const ready = await requireUserReady(session.userId)
  if (!ready.ok) return ready.response

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

  const { body, parentId, imageUrl, pdfUrl: pdfUrlRaw, pdfName: pdfNameRaw } = await req.json()
  const hasText = !!body?.trim() && body.trim().length >= 2
  // A sticker arrives in `imageUrl` as the sentinel `sticker:<id>`. Only
  // ids from the in-house catalog are accepted — anything else is dropped.
  const stickerId = parseStickerRef(imageUrl)
  const hasSticker = !!stickerId
  const hasImage = !hasSticker && typeof imageUrl === 'string' && imageUrl.startsWith('https://') && imageUrl.length < 500
  // PDF attachment validation matches the post-route pattern: trust
  // the composer's MIME / size gate, but cap URL + filename lengths
  // server-side so a malicious caller can't write huge strings into
  // the Comment row.
  const hasPdf =
    typeof pdfUrlRaw === 'string' &&
    pdfUrlRaw.startsWith('https://') &&
    pdfUrlRaw.length < 500
  const pdfUrl: string | null = hasPdf ? pdfUrlRaw.trim() : null
  const pdfName: string | null = hasPdf
    ? (typeof pdfNameRaw === 'string' ? pdfNameRaw.trim().slice(0, 200) : '') || 'document.pdf'
    : null

  if (!hasText && !hasImage && !hasPdf && !hasSticker) {
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
      imageUrl: hasSticker ? toStickerRef(stickerId!) : (hasImage ? imageUrl : null),
      pdfUrl,
      pdfName,
      parentId: parentId || null,
    },
    include: {
      author: { select: { id: true, name: true, lastName: true, reputation: true, accountType: true, providerStatus: true, avatarUrl: true, coverUrl: true, role: true, gender: true, createdAt: true, bio: true, serviceDescription: true, serviceAddress: true, serviceLat: true, serviceLng: true, neighborhood: { select: { name: true, nameEn: true } }, _count: { select: { posts: true } } } },
      replies: { include: { author: { select: { id: true, name: true, lastName: true, reputation: true } } } },
    },
  })

  // Notifications
  if (parentId && parentComment) {
    await createNotification({
      type: 'REPLY_TO_COMMENT',
      userId: parentComment.authorId,
      actorId: session.userId,
      actorName: fullName(comment.author) || comment.author.name || undefined,
      postId: params.id,
      postTitle: post.title.slice(0, 80),
      commentId: comment.id,
    })
  } else {
    await createNotification({
      type: 'COMMENT_ON_POST',
      userId: post.authorId,
      actorId: session.userId,
      actorName: fullName(comment.author) || comment.author.name || undefined,
      postId: params.id,
      postTitle: post.title.slice(0, 80),
      commentId: comment.id,
    })
  }

  // ── Push notification enqueue (fire-and-forget) ────────────────────
  // Reply path is exclusive: never enqueue comment_on_post for a reply.
  const actorNameForPush = fullName(comment.author) || comment.author?.name || null
  const pushSnippet = (censoredBody || '').slice(0, 120)

  if (parentId && parentComment) {
    const recipientId = parentComment.authorId
    if (recipientId !== session.userId) {
      try {
        await db.notifJob.create({
          data: {
            type: 'reply_to_comment',
            priority: 'high',
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
        })
      } catch (err) {
        console.error('[NOTIF_JOB] enqueue reply_to_comment failed:', err)
      }
      kickNotifCron()
    }
  } else if (post.authorId !== session.userId) {
    try {
      await db.notifJob.create({
        data: {
          type: 'comment_on_post',
          priority: 'high',
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
      })
    } catch (err) {
      console.error('[NOTIF_JOB] enqueue comment_on_post failed:', err)
    }
    kickNotifCron()
  }

  // ── Follow-post subscribers fan-out ────────────────────────────────
  // Anyone who subscribed to this post (other than the author, who
  // already gets comment_on_post above, and the commenter themselves)
  // gets an in-app bell row every time. For phone push we apply a
  // per-subscriber-per-post cooldown: no more than one push every
  // FOLLOW_NOTIFY_COOLDOWN_MS so a lively comment thread doesn't
  // carpet-bomb anyone who tapped "Follow post". Missed pushes are
  // absorbed by the bell count — not spammy, but not silently dropped.
  const FOLLOW_NOTIFY_COOLDOWN_MS = 10 * 60_000 // 10 minutes per subscriber per post

  try {
    const subs = await db.postSubscription.findMany({
      where: {
        postId: params.id,
        userId: {
          notIn: [
            session.userId,
            post.authorId, // covered by the author-push path above
            ...(parentId && parentComment ? [parentComment.authorId] : []),
          ],
        },
      },
      select: { id: true, userId: true, lastNotifiedAt: true },
    })

    if (subs.length > 0) {
      // Bell rows — always, so the in-app unread badge stays accurate
      // even when the push was throttled.
      await db.notification.createMany({
        data: subs.map((s) => ({
          type: 'COMMENT_ON_POST' as const,
          userId: s.userId,
          actorId: session.userId,
          actorName: actorNameForPush || undefined,
          postId: params.id,
          postTitle: post.title.slice(0, 80),
          commentId: comment.id,
        })),
      })

      // Push jobs — only for subscribers whose last push on this post
      // landed longer than the cooldown ago (or never).
      const now = Date.now()
      const pushable = subs.filter((s) => {
        if (!s.lastNotifiedAt) return true
        return now - new Date(s.lastNotifiedAt).getTime() >= FOLLOW_NOTIFY_COOLDOWN_MS
      })

      if (pushable.length > 0) {
        await db.notifJob.createMany({
          data: pushable.map((s) => ({
            type: 'follow_post_comment',
            priority: 'normal',
            targetType: 'user',
            targetRef: s.userId,
            payload: {
              postId: params.id,
              commentId: comment.id,
              actorId: session.userId,
              actorName: actorNameForPush,
              postTitle: post.title.slice(0, 80),
              snippet: pushSnippet,
            },
          })),
        })
        // Bump cooldown clock for this batch so a second comment within
        // the window skips the push path.
        await db.postSubscription.updateMany({
          where: { id: { in: pushable.map((s) => s.id) } },
          data: { lastNotifiedAt: new Date() },
        })
        kickNotifCron()
      }
    }
  } catch (err) {
    console.error('[NOTIF_JOB] enqueue follow_post_comment failed:', err)
  }

  return NextResponse.json(comment)
}

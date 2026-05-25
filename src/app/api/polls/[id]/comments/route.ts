import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { apiError } from '@/lib/validation'
import { moderateContent } from '@/lib/moderation'
import { requireUserReady } from '@/lib/requireUserReady'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { parseStickerRef, toStickerRef } from '@/lib/stickers/catalog'

// Same author shape the post-comment UI (UserProfileSheet / UserBadgeDisplay)
// expects, so poll comments render with badges + tap-to-profile parity.
const AUTHOR_SELECT = {
  id: true, name: true, lastName: true, reputation: true, accountType: true,
  providerStatus: true, avatarUrl: true, coverUrl: true, role: true, gender: true,
  membership: true, createdAt: true, bio: true, serviceDescription: true,
  serviceAddress: true, serviceLat: true, serviceLng: true,
  neighborhood: { select: { name: true, nameEn: true } }, _count: { select: { posts: true } },
} as const

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const comments = await db.pollComment.findMany({
    where: { pollId: params.id, parentId: null },
    include: {
      author: { select: AUTHOR_SELECT },
      likes: { select: { userId: true } },
      _count: { select: { likes: true } },
      replies: {
        include: {
          author: { select: AUTHOR_SELECT },
          likes: { select: { userId: true } },
          _count: { select: { likes: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })

  const formatted = comments.map((c) => ({
    ...c,
    likeCount: c._count.likes,
    isLiked: c.likes.some((l) => l.userId === session.userId),
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
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ready = await requireUserReady(session.userId)
  if (!ready.ok) return ready.response

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { status: true, role: true },
  })
  const bypass = isSuperAdminRole(user?.role)
  if (!bypass && (user?.status === 'BANNED_TEMP' || user?.status === 'BANNED_PERM')) {
    return NextResponse.json({ error: 'حسابك موقوف' }, { status: 403 })
  }

  const poll = await db.poll.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!poll) return NextResponse.json({ error: 'التصويت غير موجود' }, { status: 404 })

  if (!bypass) {
    // Rate limit: max 10 comments/minute across the app (mirrors posts).
    const oneMinuteAgo = new Date(Date.now() - 60_000)
    const recent = await db.pollComment.count({
      where: { authorId: session.userId, createdAt: { gte: oneMinuteAgo } },
    })
    if (recent >= 10) {
      return NextResponse.json(apiError('حاول مجدداً بعد قليل', 429), { status: 429 })
    }
  }

  const { body, parentId, imageUrl } = await req.json()
  const hasText = !!body?.trim() && body.trim().length >= 2
  const stickerId = parseStickerRef(imageUrl)
  const hasSticker = !!stickerId
  const hasImage = !hasSticker && typeof imageUrl === 'string' && imageUrl.startsWith('https://') && imageUrl.length < 500

  if (!hasText && !hasImage && !hasSticker) {
    return NextResponse.json({ error: 'التعليق فارغ' }, { status: 400 })
  }
  if (body && body.length > 500) return NextResponse.json({ error: 'التعليق طويل جداً' }, { status: 400 })

  // Verify parentId belongs to this poll.
  if (parentId) {
    const parent = await db.pollComment.findUnique({ where: { id: parentId }, select: { pollId: true } })
    if (!parent || parent.pollId !== params.id) {
      return NextResponse.json({ error: 'تعليق غير صالح' }, { status: 400 })
    }
  }

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
      }
      censoredBody = mod.censored
    }
  }

  const comment = await db.pollComment.create({
    data: {
      pollId: params.id,
      authorId: session.userId,
      body: censoredBody,
      imageUrl: hasSticker ? toStickerRef(stickerId!) : (hasImage ? imageUrl : null),
      parentId: parentId || null,
    },
    include: {
      author: { select: AUTHOR_SELECT },
      likes: { select: { userId: true } },
      _count: { select: { likes: true } },
    },
  })

  // Notifications are intentionally deferred — poll-comment bell/push needs
  // poll-aware notification types + deep-links (a separate change).

  return NextResponse.json({ ...comment, likeCount: 0, isLiked: false, replies: [] }, { status: 201 })
}

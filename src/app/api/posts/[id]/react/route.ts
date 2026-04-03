import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { createNotification } from '@/lib/notifications'
import { addReputation, REP_POINTS } from '@/lib/reputation'

function isValidEmoji(str: string) {
  return typeof str === 'string' && str.trim().length > 0 && str.length <= 8
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

  const { emoji } = await req.json()
  if (!isValidEmoji(emoji)) {
    return NextResponse.json({ error: 'رمز تعبيري غير صالح' }, { status: 400 })
  }

  // Neighborhood isolation: verify post belongs to user's neighborhood
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { neighborhoodId: true, name: true, status: true },
  })
  if (user?.status === 'BANNED_TEMP' || user?.status === 'BANNED_PERM') {
    return NextResponse.json({ error: 'حسابك موقوف' }, { status: 403 })
  }
  const post = await db.post.findUnique({
    where: { id: params.id },
    select: { neighborhoodId: true, authorId: true, title: true, category: true },
  })
  if (!post) return NextResponse.json({ error: 'المنشور غير موجود' }, { status: 404 })
  if (post.neighborhoodId !== user?.neighborhoodId) {
    return NextResponse.json({ error: 'لا يمكنك التفاعل مع منشورات حي آخر' }, { status: 403 })
  }

  const existing = await db.reaction.findUnique({
    where: { postId_userId: { postId: params.id, userId: session.userId } },
  })

  if (existing) {
    if (existing.emoji === emoji) {
      await db.reaction.delete({ where: { id: existing.id } })
      return NextResponse.json({ action: 'removed', emoji })
    } else {
      await db.reaction.update({ where: { id: existing.id }, data: { emoji } })
      return NextResponse.json({ action: 'updated', emoji, prevEmoji: existing.emoji })
    }
  }

  await db.reaction.create({
    data: { postId: params.id, userId: session.userId, emoji },
  })

  // Notify post author (new reaction only, not toggle/remove)
  if (post) {
    await createNotification({
      type: 'REACTION_ON_POST',
      userId: post.authorId,
      actorId: session.userId,
      actorName: user?.name || undefined,
      postId: params.id,
      postTitle: post.title.slice(0, 80),
    })
  }

  // Rep: +2 to post author — but NOT for request/help posts (the requester didn't help anyone)
  const NO_REP_CATEGORIES = ['LOOKING_FOR', 'RIDE_REQUEST']
  if (!NO_REP_CATEGORIES.includes(post.category)) {
    await addReputation({
      userId: post.authorId,
      fromUserId: session.userId,
      action: 'reaction_received',
      points: REP_POINTS.reaction_received,
      postId: params.id,
    })
  }

  return NextResponse.json({ action: 'added', emoji })
}

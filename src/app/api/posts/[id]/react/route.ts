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

  // ── Push notification enqueue with 30-min dedup/aggregation ─────────
  if (post && post.authorId !== session.userId) {
    const recipientId = post.authorId
    const dedupKey = `reaction:${params.id}:${recipientId}`
    const actorNameForPush = user?.name || null
    const actorIdForPush = session.userId
    const postIdForPush = params.id

    ;(async () => {
      const windowStart = new Date(Date.now() - 30 * 60_000)
      try {
        await db.$transaction(async (tx) => {
          const existingJob = await tx.notifJob.findFirst({
            where: {
              dedupKey,
              status: 'pending',
              createdAt: { gte: windowStart },
            },
            orderBy: { createdAt: 'desc' },
          })
          if (existingJob) {
            const old = (existingJob.payload || {}) as {
              actorIds?: string[]
              actorNames?: (string | null)[]
            }
            const actorIds = Array.isArray(old.actorIds) ? [...old.actorIds] : []
            const actorNames = Array.isArray(old.actorNames) ? [...old.actorNames] : []
            if (actorIds.includes(actorIdForPush)) return
            actorIds.push(actorIdForPush)
            actorNames.push(actorNameForPush)
            await tx.notifJob.update({
              where: { id: existingJob.id },
              data: {
                payload: {
                  postId: postIdForPush,
                  recipientId,
                  actorIds,
                  actorNames,
                  count: actorIds.length,
                },
              },
            })
          } else {
            await tx.notifJob.create({
              data: {
                type: 'reaction_on_post',
                priority: 'normal',
                targetType: 'user',
                targetRef: recipientId,
                dedupKey,
                payload: {
                  postId: postIdForPush,
                  recipientId,
                  actorIds: [actorIdForPush],
                  actorNames: [actorNameForPush],
                  count: 1,
                },
              },
            })
          }
        })
      } catch (err) {
        console.error('[NOTIF_JOB] enqueue reaction_on_post failed:', err)
      }
    })()
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

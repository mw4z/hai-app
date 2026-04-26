import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { addReputation, REP_POINTS } from '@/lib/reputation'
import { createNotification } from '@/lib/notifications'
import { fullName } from '@/lib/displayName'

// POST /api/threads/[id]/rate — rate the other participant after closing
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rating } = await req.json() // 'positive' | 'neutral' | 'negative'
  if (!['positive', 'neutral', 'negative'].includes(rating)) {
    return NextResponse.json({ error: 'Invalid rating' }, { status: 400 })
  }

  const thread = await db.thread.findUnique({
    where: { id: params.id },
    select: { user1Id: true, user2Id: true, status: true, postId: true },
  })

  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (thread.user1Id !== session.userId && thread.user2Id !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Only allow rating on closed threads
  if (thread.status !== 'CLOSED') {
    return NextResponse.json({ error: 'Thread must be closed first' }, { status: 400 })
  }

  // Determine who is the helper (not the post author)
  const otherId = thread.user1Id === session.userId ? thread.user2Id : thread.user1Id

  // Only the POST AUTHOR can rate the HELPER. The helper cannot rate the author.
  let postAuthorId: string | null = null
  if (thread.postId) {
    const post = await db.post.findUnique({ where: { id: thread.postId }, select: { authorId: true } })
    postAuthorId = post?.authorId || null
  }

  // If the rater is the helper (not the author), skip — only the author rates
  if (postAuthorId && session.userId !== postAuthorId) {
    return NextResponse.json({ error: 'Only the requester can rate' }, { status: 400 })
  }

  // Check if already rated (prevent double rating)
  const alreadyRated = await db.reputationLog.findFirst({
    where: {
      userId: otherId,
      fromUserId: session.userId,
      action: { in: ['positive_rating', 'negative_rating', 'neutral_rating'] },
      postId: thread.postId,
    },
  })
  if (alreadyRated) {
    return NextResponse.json({ error: 'Already rated' }, { status: 400 })
  }

  // Apply reputation based on rating — weighted by rater's trust level
  const rater = await db.user.findUnique({
    where: { id: session.userId },
    select: { name: true, lastName: true, reputation: true, createdAt: true },
  })

  // Calculate weighted points based on rater's reputation
  const { getRatingWeight } = await import('@/lib/reputation-levels')
  const raterAgeDays = rater ? (Date.now() - new Date(rater.createdAt).getTime()) / 86400_000 : 0
  const weight = getRatingWeight(rater?.reputation || 0, raterAgeDays)

  if (rating === 'positive') {
    const weightedPoints = Math.round(REP_POINTS.positive_rating * weight)
    await addReputation({
      userId: otherId,
      fromUserId: session.userId,
      action: 'positive_rating',
      points: weightedPoints,
      postId: thread.postId || undefined,
    })
    createNotification({
      type: 'REACTION_ON_POST',
      userId: otherId,
      actorId: session.userId,
      actorName: fullName(rater) || rater?.name || undefined,
      postTitle: 'حصلت على تقييم ممتاز! ⭐',
    })
  } else if (rating === 'negative') {
    const weightedNeg = Math.round(REP_POINTS.negative_rating * weight)
    await addReputation({
      userId: otherId,
      fromUserId: session.userId,
      action: 'negative_rating',
      points: weightedNeg,
      postId: thread.postId || undefined,
    })
  }
  // neutral = no rep change, but still logged to prevent double rating

  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BATCH_LIMIT = 500
const ACTIVE_THRESHOLD_DAYS = 30
const MIN_NBHD_POSTS = 3
const SAUDI_UTC_OFFSET_HOURS = 3

function getWeekStart(): Date {
  const now = new Date()
  const saudi = new Date(now.getTime() + SAUDI_UTC_OFFSET_HOURS * 3600_000)
  saudi.setUTCHours(0, 0, 0, 0)
  return new Date(saudi.getTime() - SAUDI_UTC_OFFSET_HOURS * 3600_000)
}

export async function GET(req: NextRequest) {
  return handle(req)
}
export async function POST(req: NextRequest) {
  return handle(req)
}

async function handle(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') != null
  const auth = req.headers.get('authorization') || ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron) {
    if (!expected || auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const weekStart = getWeekStart()
  const contentStart = new Date(weekStart.getTime() - 7 * 24 * 3600_000)
  const activeThreshold = new Date(
    Date.now() - ACTIVE_THRESHOLD_DAYS * 24 * 3600_000,
  )

  const summary = {
    ok: true,
    weekStart: weekStart.toISOString(),
    considered: 0,
    enqueued: 0,
    skippedNoContent: 0,
    skippedAlreadySent: 0,
    skippedEnqueueError: 0,
  }

  const sentRows = await db.digestLog.findMany({
    where: { weekStart },
    select: { userId: true },
  })
  const sentIds = sentRows.map((r) => r.userId)

  const users = await db.user.findMany({
    where: {
      status: { notIn: ['BANNED_TEMP', 'BANNED_PERM'] },
      neighborhoodId: { not: null },
      ...(sentIds.length ? { id: { notIn: sentIds } } : {}),
      deviceTokens: { some: { lastSeenAt: { gte: activeThreshold } } },
      NOT: { notifPreference: { weeklyDigest: false } },
    },
    select: { id: true, neighborhoodId: true },
    orderBy: { id: 'asc' },
    take: BATCH_LIMIT,
  })

  summary.considered = users.length
  if (users.length === 0) {
    console.log('[WEEKLY_DIGEST] no eligible users', summary)
    return NextResponse.json(summary)
  }

  const userIds = users.map((u) => u.id)
  const nbhdIds = Array.from(
    new Set(users.map((u) => u.neighborhoodId!).filter(Boolean)),
  )

  type PostRow = {
    id: string
    neighborhoodId: string
    authorId: string
    reactions: bigint
    comments: bigint
  }
  const posts = await db.$queryRaw<PostRow[]>`
    SELECT
      p.id,
      p."neighborhoodId",
      p."authorId",
      (SELECT COUNT(*) FROM "Reaction" r WHERE r."postId" = p.id) AS reactions,
      (SELECT COUNT(*) FROM "Comment"  c WHERE c."postId" = p.id) AS comments
    FROM "Post" p
    WHERE p."neighborhoodId" = ANY(${nbhdIds})
      AND p."createdAt" >= ${contentStart}
      AND p."createdAt" <  ${weekStart}
      AND p.status IN ('ACTIVE', 'IN_PROGRESS')
  `

  type NbhdStat = { count: number; topPostId: string | null; topScore: number }
  const nbhdStats = new Map<string, NbhdStat>()
  for (const p of posts) {
    const s: NbhdStat = nbhdStats.get(p.neighborhoodId) ?? {
      count: 0,
      topPostId: null,
      topScore: -1,
    }
    s.count++
    const score = Number(p.reactions) * 2 + Number(p.comments)
    if (score > s.topScore) {
      s.topScore = score
      s.topPostId = p.id
    }
    nbhdStats.set(p.neighborhoodId, s)
  }

  type AggRow = { authorId: string; cnt: bigint }
  const commentsRows = await db.$queryRaw<AggRow[]>`
    SELECT p."authorId" AS "authorId", COUNT(*)::bigint AS cnt
    FROM "Comment" c
    JOIN "Post" p ON c."postId" = p.id
    WHERE p."authorId" = ANY(${userIds})
      AND c."createdAt" >= ${contentStart}
      AND c."createdAt" <  ${weekStart}
      AND c."authorId" <> p."authorId"
    GROUP BY p."authorId"
  `
  const commentsMap = new Map<string, number>(
    commentsRows.map((r) => [r.authorId, Number(r.cnt)]),
  )

  const reactionsRows = await db.$queryRaw<AggRow[]>`
    SELECT p."authorId" AS "authorId", COUNT(*)::bigint AS cnt
    FROM "Reaction" r
    JOIN "Post" p ON r."postId" = p.id
    WHERE p."authorId" = ANY(${userIds})
      AND r."createdAt" >= ${contentStart}
      AND r."createdAt" <  ${weekStart}
      AND r."userId" <> p."authorId"
    GROUP BY p."authorId"
  `
  const reactionsMap = new Map<string, number>(
    reactionsRows.map((r) => [r.authorId, Number(r.cnt)]),
  )

  for (const u of users) {
    const nbhdId = u.neighborhoodId!
    const stats = nbhdStats.get(nbhdId)
    const nbhdCount = stats?.count || 0
    const myComments = commentsMap.get(u.id) || 0
    const myReactions = reactionsMap.get(u.id) || 0

    const hasPersonal = myComments + myReactions > 0
    const hasNbhd = nbhdCount >= MIN_NBHD_POSTS
    if (!hasPersonal && !hasNbhd) {
      summary.skippedNoContent++
      continue
    }

    try {
      await db.$transaction(async (tx) => {
        await tx.digestLog.create({
          data: {
            userId: u.id,
            weekStart,
            postCount: nbhdCount,
          },
        })
        await tx.notifJob.create({
          data: {
            type: 'weekly_digest',
            priority: 'low',
            targetType: 'user',
            targetRef: u.id,
            payload: {
              weekStart: weekStart.toISOString(),
              neighborhoodId: nbhdId,
              neighborhoodPostCount: nbhdCount,
              myCommentsReceived: myComments,
              myReactionsReceived: myReactions,
              topPostId: stats?.topPostId ?? null,
            },
          },
        })
      })
      summary.enqueued++
    } catch (err: any) {
      if (err?.code === 'P2002') {
        summary.skippedAlreadySent++
        continue
      }
      summary.skippedEnqueueError++
      console.error('[WEEKLY_DIGEST] enqueue failed', {
        userId: u.id,
        err: err?.message || String(err),
      })
    }
  }

  console.log('[WEEKLY_DIGEST] done', summary)
  return NextResponse.json(summary)
}

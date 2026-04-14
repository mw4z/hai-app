import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  generateSeedPostsExact,
  generateSeedComments,
} from '@/lib/seed-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/admin/seed/generate
 * body: {
 *   scope: 'one' | 'all',
 *   neighborhoodId?: string,  // required when scope='one'
 *   targetPosts: number,       // per-neighborhood target
 *   commentsPerPost: number,   // 0 = skip comment generation
 * }
 *
 * SUPER_ADMIN only. Creates exactly `targetPosts` seed posts in the
 * target neighborhood(s), then optionally adds `commentsPerPost`
 * seed comments to each seed post.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  })
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    scope?: 'one' | 'all'
    neighborhoodId?: string
    targetPosts?: number
    commentsPerPost?: number
  }

  const scope: 'one' | 'all' = body.scope === 'all' ? 'all' : 'one'
  const targetPosts = Math.max(0, Math.min(Number(body.targetPosts) || 0, 30))
  const commentsPerPost = Math.max(
    0,
    Math.min(Number(body.commentsPerPost) || 0, 10),
  )

  let targetNbhds: string[] = []
  if (scope === 'all') {
    const all = await db.neighborhood.findMany({
      where: { hidden: false },
      select: { id: true },
    })
    targetNbhds = all.map((n) => n.id)
  } else {
    if (!body.neighborhoodId) {
      return NextResponse.json(
        { error: 'neighborhoodId required' },
        { status: 400 },
      )
    }
    targetNbhds = [body.neighborhoodId]
  }

  // Parallel batched execution — 5 neighborhoods at a time. Each
  // neighborhood's work is wrapped in try/catch so one failure doesn't
  // corrupt the whole response. Overall time budget ~50s to stay well
  // under Vercel's 60s limit.
  const BATCH_SIZE = 5
  const TIME_BUDGET_MS = 50_000
  const startedAt = Date.now()

  let totalPosts = 0
  let totalComments = 0
  const errors: { id: string; error: string }[] = []
  const processed: string[] = []

  for (let i = 0; i < targetNbhds.length; i += BATCH_SIZE) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      console.warn('[SEED_GENERATE] time budget exceeded, stopping early', {
        processed: processed.length,
        remaining: targetNbhds.length - processed.length,
      })
      break
    }
    const batch = targetNbhds.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (nbhdId) => {
        let postCount = 0
        let commentCount = 0
        if (targetPosts > 0) {
          postCount = await generateSeedPostsExact(nbhdId, targetPosts)
        }
        if (commentsPerPost > 0) {
          commentCount = await generateSeedComments(nbhdId, commentsPerPost)
        }
        return { nbhdId, postCount, commentCount }
      }),
    )
    for (let j = 0; j < results.length; j++) {
      const r = results[j]
      const nbhdId = batch[j]
      processed.push(nbhdId)
      if (r.status === 'fulfilled') {
        totalPosts += r.value.postCount
        totalComments += r.value.commentCount
      } else {
        const errMsg = r.reason?.message || String(r.reason)
        console.error('[SEED_GENERATE] failed for', nbhdId, errMsg)
        errors.push({ id: nbhdId, error: errMsg.slice(0, 200) })
      }
    }
  }

  const partial = processed.length < targetNbhds.length

  console.log('[SEED_GENERATE] done', {
    scope,
    requested: targetNbhds.length,
    processed: processed.length,
    totalPosts,
    totalComments,
    errors: errors.length,
    partial,
    tookMs: Date.now() - startedAt,
  })

  return NextResponse.json({
    ok: true,
    neighborhoods: processed.length,
    requested: targetNbhds.length,
    totalPosts,
    totalComments,
    errors,
    partial,
  })
}

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

  let totalPosts = 0
  let totalComments = 0
  const errors: string[] = []

  for (const nbhdId of targetNbhds) {
    try {
      if (targetPosts > 0) {
        const count = await generateSeedPostsExact(nbhdId, targetPosts)
        totalPosts += count
      }
      if (commentsPerPost > 0) {
        const count = await generateSeedComments(nbhdId, commentsPerPost)
        totalComments += count
      }
    } catch (err: any) {
      console.error('[SEED_GENERATE] failed for', nbhdId, err)
      errors.push(nbhdId)
    }
  }

  console.log('[SEED_GENERATE] done', {
    scope,
    neighborhoods: targetNbhds.length,
    totalPosts,
    totalComments,
    errors: errors.length,
  })

  return NextResponse.json({
    ok: true,
    neighborhoods: targetNbhds.length,
    totalPosts,
    totalComments,
    errors,
  })
}

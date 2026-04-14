import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { clearSeedContent } from '@/lib/seed-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/admin/seed/clear
 * body: {
 *   neighborhoodId?: string,  // omit to clear all neighborhoods
 *   scope: 'posts' | 'comments' | 'all',
 *   includeUsers?: boolean,   // only with scope='all', nukes seed users
 * }
 *
 * SUPER_ADMIN only. Deletes seed content with the requested scope.
 * Returns counts of deleted rows.
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
    neighborhoodId?: string
    scope?: 'posts' | 'comments' | 'all'
    includeUsers?: boolean
  }

  const scope: 'posts' | 'comments' | 'all' =
    body.scope === 'comments' || body.scope === 'all' ? body.scope : 'posts'

  try {
    const result = await clearSeedContent({
      neighborhoodId: body.neighborhoodId,
      scope,
      includeUsers: scope === 'all' && body.includeUsers === true,
    })
    console.log('[SEED_CLEAR] done', { ...result, scope, neighborhoodId: body.neighborhoodId })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[SEED_CLEAR] failed', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

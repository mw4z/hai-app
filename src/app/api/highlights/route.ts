import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { getHighlights } from '@/lib/highlights'

export const dynamic = 'force-dynamic'

/**
 * GET /api/highlights?neighborhoodId=...
 *
 * Returns the highlights bundle for a neighborhood, audience-scoped to
 * the calling user's gender. The session-bound user must either belong
 * to that neighborhood or be browsing it (read-only). We don't enforce
 * a hard membership check — the same posts are visible on the feed
 * already, this is just a curated subset.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const neighborhoodId = searchParams.get('neighborhoodId')
  if (!neighborhoodId) {
    return NextResponse.json({ error: 'neighborhoodId required' }, { status: 400 })
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { gender: true },
  })

  const bundle = await getHighlights(neighborhoodId, user?.gender ?? null)
  return NextResponse.json(bundle)
}

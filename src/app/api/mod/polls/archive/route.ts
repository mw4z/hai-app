import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/mod/polls/archive
 *
 * Returns polls in the moderator's neighborhood (or all neighborhoods
 * for PLATFORM_MOD / SUPER_ADMIN) with their FINAL vote tallies — one
 * row per poll with vote counts per option, total votes, view count,
 * status, and author info. Sorted newest-first.
 *
 * Used by the "أرشيف الاستطلاعات / Polls archive" tab in the mod
 * dashboard so moderators can review historical poll results and
 * export them as images.
 *
 * Query params:
 *   ?status=all|active|closed   default: all
 *   ?q=<text>                   optional question text filter
 *   ?limit=<n>                  default 50, max 200
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true, status: true },
  })
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (me.role === 'RESIDENT') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (me.status === 'BANNED_TEMP' || me.status === 'BANNED_PERM') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get('status') || 'all'
  const q = (searchParams.get('q') || '').trim()
  const limitParam = parseInt(searchParams.get('limit') || '50', 10)
  const limit = Math.min(Math.max(isNaN(limitParam) ? 50 : limitParam, 1), 200)

  // Scope: NEIGHBORHOOD_MOD sees only their own neighborhood's polls.
  // PLATFORM_MOD + SUPER_ADMIN see everything.
  const isPlatform = me.role === 'PLATFORM_MOD' || me.role === 'SUPER_ADMIN'
  const where: any = {}
  if (!isPlatform) {
    if (!me.neighborhoodId) return NextResponse.json({ polls: [] })
    where.neighborhoodId = me.neighborhoodId
  }
  if (statusFilter === 'active') where.status = 'active'
  else if (statusFilter === 'closed') where.status = 'closed'
  // 'all' → no status filter

  // q is matched against the question. Use case-insensitive contains
  // for a quick filter — Arabic ILIKE isn't perfect (no
  // matchesArabic here) but acceptable for a mod tool.
  if (q) where.question = { contains: q, mode: 'insensitive' }

  const polls = await db.poll.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      question: true,
      options: true,
      status: true,
      viewCount: true,
      createdAt: true,
      expiresAt: true,
      neighborhoodId: true,
      author: {
        select: { id: true, name: true, lastName: true, avatarUrl: true, reputation: true },
      },
    },
  })

  // Poll.neighborhoodId is a plain string (no relation on the
  // schema), so fetch the neighborhood metadata in a separate batch
  // query and join in memory.
  const nbhdIds = Array.from(new Set(polls.map((p) => p.neighborhoodId).filter(Boolean)))
  const nbhds = nbhdIds.length
    ? await db.neighborhood.findMany({
        where: { id: { in: nbhdIds } },
        select: { id: true, name: true, nameEn: true },
      })
    : []
  const nbhdById = new Map(nbhds.map((n) => [n.id, n]))

  // Aggregate vote counts per (pollId, optionIndex) in a single
  // groupBy. Avoids N+1 queries when listing many polls.
  const pollIds = polls.map((p) => p.id)
  const voteRows = pollIds.length
    ? await db.pollVote.groupBy({
        by: ['pollId', 'optionIndex'],
        where: { pollId: { in: pollIds } },
        _count: { _all: true },
      })
    : []
  const votesByPoll = new Map<string, Map<number, number>>()
  for (const row of voteRows) {
    let m = votesByPoll.get(row.pollId)
    if (!m) {
      m = new Map<number, number>()
      votesByPoll.set(row.pollId, m)
    }
    m.set(row.optionIndex, row._count._all)
  }

  const enriched = polls.map((p) => {
    const counts = votesByPoll.get(p.id) || new Map<number, number>()
    const breakdown = p.options.map((label, idx) => ({
      label,
      votes: counts.get(idx) ?? 0,
    }))
    const totalVotes = breakdown.reduce((s, b) => s + b.votes, 0)
    const isExpired = p.expiresAt ? new Date(p.expiresAt).getTime() < Date.now() : false
    return {
      id: p.id,
      question: p.question,
      status: p.status,                    // 'active' | 'closed'
      isExpired,                           // true if expiresAt is in the past (regardless of status)
      viewCount: p.viewCount,
      createdAt: p.createdAt.toISOString(),
      expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
      totalVotes,
      breakdown,                           // [{ label, votes }]
      author: p.author && {
        id: p.author.id,
        name: p.author.name,
        lastName: p.author.lastName,
        avatarUrl: p.author.avatarUrl,
        reputation: p.author.reputation,
      },
      neighborhood: (() => {
        const n = nbhdById.get(p.neighborhoodId)
        return n ? { id: n.id, name: n.name, nameEn: n.nameEn } : null
      })(),
    }
  })

  return NextResponse.json({ polls: enriched })
}

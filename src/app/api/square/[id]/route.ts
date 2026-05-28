import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { apiError } from '@/lib/validation'
import { isSquareAdminRole } from '@/lib/square/isSquareAdmin'
import { serializeSquareThread } from '@/lib/square/serializeThread'

interface Params { params: Promise<{ id: string }> }

/**
 * GET /api/square/[id] — thread detail (without replies; replies live
 * at /api/square/[id]/replies so the two can paginate independently).
 *
 * Admin-only in MVP. HIDDEN threads are visible to admins (so they can
 * see what was moderated); a non-admin path would have returned 404
 * before reaching this branch.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return NextResponse.json(apiError('Not found', 404), { status: 404 })

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!me?.neighborhoodId) return NextResponse.json(apiError('Not found', 404), { status: 404 })
  if (!isSquareAdminRole(me.role)) {
    return NextResponse.json(apiError('Not found', 404), { status: 404 })
  }

  const { id } = await params
  const row = await db.squareThread.findUnique({
    where: { id },
    include: {
      author: {
        select: {
          id: true, name: true, lastName: true, avatarUrl: true,
          reputation: true, membership: true, role: true,
        },
      },
    },
  })
  if (!row) return NextResponse.json(apiError('Not found', 404), { status: 404 })
  // Neighborhood isolation — same-neighborhood only for non-platform mods.
  if (row.neighborhoodId !== me.neighborhoodId && me.role !== 'PLATFORM_MOD' && me.role !== 'SUPER_ADMIN') {
    return NextResponse.json(apiError('Not found', 404), { status: 404 })
  }

  const isFollowing = !!(await db.squareFollow.findUnique({
    where: { threadId_userId: { threadId: id, userId: me.id } },
    select: { id: true },
  }))

  return NextResponse.json({
    thread: serializeSquareThread(row, {
      viewerId: me.id,
      followingThreadIds: isFollowing ? new Set([row.id]) : new Set(),
    }),
  })
}

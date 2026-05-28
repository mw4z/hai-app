import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { apiError } from '@/lib/validation'
import { isSquareAdminRole } from '@/lib/square/isSquareAdmin'

interface Params { params: Promise<{ id: string }> }

/** POST /api/square/[id]/follow — start following this thread. */
export async function POST(_req: NextRequest, { params }: Params) {
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

  const { id: threadId } = await params
  const thread = await db.squareThread.findUnique({
    where: { id: threadId },
    select: { id: true, neighborhoodId: true, status: true },
  })
  if (!thread || thread.status === 'HIDDEN') {
    return NextResponse.json(apiError('Not found', 404), { status: 404 })
  }
  if (thread.neighborhoodId !== me.neighborhoodId && me.role !== 'PLATFORM_MOD' && me.role !== 'SUPER_ADMIN') {
    return NextResponse.json(apiError('Not found', 404), { status: 404 })
  }

  // Idempotent — duplicate follows are silently a no-op so the UI can
  // optimistically toggle without race protection.
  await db.$transaction(async (tx) => {
    const created = await tx.squareFollow.upsert({
      where: { threadId_userId: { threadId, userId: me.id } },
      create: { threadId, userId: me.id },
      update: {},
      select: { createdAt: true },
    })
    // Only bump the counter the first time — upsert.update sets nothing
    // so we use the "was it brand-new?" check via createdAt drift.
    const isFresh = Date.now() - new Date(created.createdAt).getTime() < 2000
    if (isFresh) {
      await tx.squareThread.update({
        where: { id: threadId },
        data: { followerCount: { increment: 1 } },
      })
    }
  })

  return NextResponse.json({ ok: true, isFollowing: true })
}

/** DELETE /api/square/[id]/follow — stop following. */
export async function DELETE(_req: NextRequest, { params }: Params) {
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

  const { id: threadId } = await params

  await db.$transaction(async (tx) => {
    const existing = await tx.squareFollow.findUnique({
      where: { threadId_userId: { threadId, userId: me.id } },
      select: { id: true },
    })
    if (!existing) return
    await tx.squareFollow.delete({ where: { id: existing.id } })
    await tx.squareThread.update({
      where: { id: threadId },
      data: { followerCount: { decrement: 1 } },
    })
  })

  return NextResponse.json({ ok: true, isFollowing: false })
}

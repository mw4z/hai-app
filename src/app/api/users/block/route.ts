import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { log } from '@/lib/logger'

/** POST — Block a user */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', '/api/users/block', session.userId)

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

    const { userId } = body
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
    if (userId === session.userId) return NextResponse.json({ error: 'Cannot block yourself' }, { status: 400 })

    // Check target exists
    const target = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Upsert — idempotent
    await db.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: session.userId, blockedId: userId } },
      create: { blockerId: session.userId, blockedId: userId },
      update: {},
    })

    log.info('User blocked', { route: '/api/users/block', userId: session.userId, blockedId: userId })

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('Block failed', error, { route: '/api/users/block' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

/** DELETE — Unblock a user */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    await db.userBlock.deleteMany({
      where: { blockerId: session.userId, blockedId: userId },
    })

    log.info('User unblocked', { route: '/api/users/block', userId: session.userId, unblockedId: userId })

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('Unblock failed', error, { route: '/api/users/block' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

/** GET — List blocked users */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const blocks = await db.userBlock.findMany({
      where: { blockerId: session.userId },
      select: { blockedId: true, createdAt: true },
    })

    // Get blocked user names
    const userIds = blocks.map(b => b.blockedId)
    const users = userIds.length > 0
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, avatarUrl: true } })
      : []
    const userMap = Object.fromEntries(users.map(u => [u.id, u]))

    return NextResponse.json(blocks.map(b => ({
      userId: b.blockedId,
      name: userMap[b.blockedId]?.name || null,
      avatarUrl: userMap[b.blockedId]?.avatarUrl || null,
      blockedAt: b.createdAt,
    })))
  } catch (error) {
    log.error('Block list failed', error, { route: '/api/users/block GET' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getValidatedSession as getSession } from '@/lib/auth-server'
import { log } from '@/lib/logger'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('GET', '/api/notifications', session.userId)

    const { searchParams } = new URL(req.url)
    const cursor = searchParams.get('cursor')
    const take = 20

    const notifications = await db.notification.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })

    const hasMore = notifications.length > take
    if (hasMore) notifications.pop()

    const unreadCount = await db.notification.count({
      where: { userId: session.userId, read: false },
    })

    return NextResponse.json({ notifications, unreadCount, hasMore })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/notifications' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

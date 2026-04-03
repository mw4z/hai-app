import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { log } from '@/lib/logger'

// POST /api/notifications/delete — delete one or all notifications
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', '/api/notifications/delete', session.userId)

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
    const { id, all } = body

    if (all) {
      await db.notification.deleteMany({ where: { userId: session.userId } })
      return NextResponse.json({ success: true })
    }

    if (id) {
      // Verify ownership
      const notif = await db.notification.findUnique({ where: { id }, select: { userId: true } })
      if (!notif || notif.userId !== session.userId) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      await db.notification.delete({ where: { id } })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Missing id or all' }, { status: 400 })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/notifications/delete' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

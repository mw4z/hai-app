import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/notifications/unread — returns unread counts (lightweight, for polling)
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ total: 0, messages: 0 })

  const [total, messages] = await Promise.all([
    db.notification.count({
      where: { userId: session.userId, read: false },
    }),
    db.notification.count({
      where: { userId: session.userId, read: false, type: 'NEW_MESSAGE' },
    }),
  ])

  return NextResponse.json({ total, messages })
}

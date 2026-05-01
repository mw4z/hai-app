import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

// GET /api/notifications/unread — returns unread counts (lightweight,
// for the BottomNav bell + messages tab badges).
//
//   total    = unread bell-list events (everything EXCEPT chat DMs).
//   messages = unread DMs across all the user's threads, sourced
//              directly from Message.readAt IS NULL — DMs are no
//              longer mirrored into the Notification table, so the
//              previous "type: NEW_MESSAGE" count is gone.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ total: 0, messages: 0 })

  const [total, messages] = await Promise.all([
    db.notification.count({
      where: {
        userId: session.userId,
        read: false,
        // Defensive — legacy NEW_MESSAGE rows from before this change
        // still exist in the DB and would inflate the bell badge.
        type: { not: 'NEW_MESSAGE' },
      },
    }),
    db.message.count({
      where: {
        senderId: { not: session.userId },
        readAt: null,
        thread: {
          status: 'ACTIVE',
          OR: [
            { user1Id: session.userId },
            { user2Id: session.userId },
          ],
        },
      },
    }),
  ])

  return NextResponse.json({ total, messages })
}

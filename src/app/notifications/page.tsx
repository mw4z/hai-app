import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import NotificationsClient from './NotificationsClient'

export default async function NotificationsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // DMs are no longer mirrored into the Notification table — the
  // threads list is the canonical surface for chat unread state.
  // Filter NEW_MESSAGE here to hide legacy rows + thread-closed
  // events that still use that type.
  const notifications = await db.notification.findMany({
    where: { userId: session.userId, type: { not: 'NEW_MESSAGE' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  // Mark all visible (non-DM) notifications as read on bell open.
  await db.notification.updateMany({
    where: { userId: session.userId, read: false, type: { not: 'NEW_MESSAGE' } },
    data: { read: true },
  })

  return <NotificationsClient initialNotifications={JSON.parse(JSON.stringify(notifications))} />
}

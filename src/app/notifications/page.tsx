import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import NotificationsClient from './NotificationsClient'

export default async function NotificationsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const notifications = await db.notification.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  // Mark non-message notifications as read (messages are marked read by /threads page)
  await db.notification.updateMany({
    where: { userId: session.userId, read: false, type: { not: 'NEW_MESSAGE' } },
    data: { read: true },
  })

  return <NotificationsClient initialNotifications={JSON.parse(JSON.stringify(notifications))} />
}

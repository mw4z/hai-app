import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

/**
 * GET /api/notifications/active-refs
 *
 * Returns the set of resource IDs that this user currently has live
 * Notification rows for. The mobile client compares this against
 * Capacitor's getDeliveredNotifications() on app foreground and
 * removes any tray entries whose underlying resource isn't in the
 * set — covers user-deleted / mod-removed / report-auto-removed
 * content so the phone tray doesn't keep showing a banner that
 * tap-jumps to a 404.
 *
 * Response shape (all arrays):
 *   {
 *     postIds:        string[]
 *     commentIds:     string[]
 *     threadIds:      string[]
 *     rideRequestIds: string[]
 *   }
 *
 * Cheap: a single SELECT with a small projection. Caller should
 * dedupe + cache for a few seconds, but since the foreground sync
 * fires at most once per app-resume, no server-side cache.
 */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const rows = await db.notification.findMany({
    where: { userId: session.userId },
    select: {
      postId: true,
      commentId: true,
      threadId: true,
      rideRequestId: true,
    },
    take: 500, // safety cap — a user with >500 unread is an edge case
  })

  const postIds = new Set<string>()
  const commentIds = new Set<string>()
  const threadIds = new Set<string>()
  const rideRequestIds = new Set<string>()

  for (const r of rows) {
    if (r.postId) postIds.add(r.postId)
    if (r.commentId) commentIds.add(r.commentId)
    if (r.threadId) threadIds.add(r.threadId)
    if (r.rideRequestId) rideRequestIds.add(r.rideRequestId)
  }

  return NextResponse.json({
    postIds: [...postIds],
    commentIds: [...commentIds],
    threadIds: [...threadIds],
    rideRequestIds: [...rideRequestIds],
  })
}

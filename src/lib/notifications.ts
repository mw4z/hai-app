import { db } from '@/lib/db'
import { NotificationType } from '@prisma/client'

const PREF_MAP: Partial<Record<NotificationType, 'notifyComments' | 'notifyReactions' | 'notifyReplies' | 'notifyLookingFor'>> = {
  COMMENT_ON_POST: 'notifyComments',
  REACTION_ON_POST: 'notifyReactions',
  REPLY_TO_COMMENT: 'notifyReplies',
  LOOKING_FOR_POST: 'notifyLookingFor',
  // NEW_MESSAGE: always delivered, no preference toggle
}

export async function createNotification(params: {
  type: NotificationType
  userId: string
  actorId: string
  actorName?: string
  postId?: string
  postTitle?: string
  commentId?: string
}) {
  if (params.userId === params.actorId) return

  // Check recipient's notification preferences (some types like NEW_MESSAGE always deliver)
  const prefField = PREF_MAP[params.type]
  if (prefField) {
    const recipient = await db.user.findUnique({
      where: { id: params.userId },
      select: { [prefField]: true },
    })
    if (recipient && !(recipient as any)[prefField]) return
  }

  await db.notification.create({ data: params })
}

/**
 * Remove every Notification row that points at a now-deleted /
 * now-hidden resource so the bell doesn't keep showing entries that
 * tap-jump to a 404. Call this from:
 *   - DELETE /api/posts/[id]                       (user-deleted)
 *   - PATCH that flips Post.status to REMOVED      (mod / report-threshold)
 *   - DELETE /api/posts/[id]/comments/[commentId]  (user-deleted comment)
 *   - DELETE /api/threads/[id]/messages/[msgId] in "for everyone" mode
 *
 * Pass at least one ref. Multiple refs are OR'd — useful when a
 * delete cascades (e.g. post removed → all its comments are dead, so
 * commentId notifications referencing those comments would also be
 * stale, but those Comment rows are still in the DB; we leave them
 * to a sweeper rather than chasing them here).
 *
 * Returns the number of rows removed so callers can log / surface.
 */
export async function cleanupNotificationsFor(refs: {
  postId?: string
  commentId?: string
  threadId?: string
  rideRequestId?: string
}): Promise<number> {
  // Notification.messageId doesn't exist — DM notifications carry
  // only threadId (one notification per thread, coalesced). When a
  // single message is "deleted for everyone", we leave the
  // notification: there may be other messages in the same thread
  // that still warrant the bell row. Threading-level cleanup happens
  // when the whole thread is closed, not on individual messages.
  const orClauses: any[] = []
  if (refs.postId) orClauses.push({ postId: refs.postId })
  if (refs.commentId) orClauses.push({ commentId: refs.commentId })
  if (refs.threadId) orClauses.push({ threadId: refs.threadId })
  if (refs.rideRequestId) orClauses.push({ rideRequestId: refs.rideRequestId })
  if (orClauses.length === 0) return 0

  const result = await db.notification.deleteMany({
    where: { OR: orClauses },
  })
  return result.count
}

export async function notifyNeighborhood(params: {
  type: NotificationType
  actorId: string
  actorName?: string
  neighborhoodId: string
  postId: string
  postTitle?: string
}) {
  const prefField = PREF_MAP[params.type]

  // Get all users in the same neighborhood who have this notification enabled
  const neighbors = await db.user.findMany({
    where: {
      neighborhoodId: params.neighborhoodId,
      id: { not: params.actorId },
      ...(prefField ? { [prefField as string]: true } : {}),
    },
    select: { id: true },
  })

  if (neighbors.length === 0) return

  await db.notification.createMany({
    data: neighbors.map((u) => ({
      type: params.type,
      userId: u.id,
      actorId: params.actorId,
      actorName: params.actorName,
      postId: params.postId,
      postTitle: params.postTitle,
    })),
  })
}

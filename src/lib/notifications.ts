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

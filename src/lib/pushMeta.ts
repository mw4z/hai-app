/**
 * Stable notification identifiers for OS-level cleanup.
 *
 * Every push we send carries a derived `notificationId` string of the
 * form `${contentType}:${contentId}` so that:
 *
 *   - Android: we forward it as the FCM notification `tag`, which lets
 *     `NotificationManager.cancel(tag, id)` (via Capacitor's
 *     `removeDeliveredNotifications`) target a specific delivered push.
 *   - iOS: we forward it as `apns-collapse-id`, which gives APNs a
 *     stable identifier per content item — duplicate pushes for the
 *     same item replace each other in Notification Center, and the
 *     identifier is preserved when we list delivered notifications.
 *   - Both platforms: the same string is included in `data.notificationId`
 *     so the JS sweep code can match by data field too.
 *
 * Why a single string and not separate fields? Because Capacitor's
 * `removeDeliveredNotifications` operates on a list of "notification
 * objects" returned from `getDeliveredNotifications()` — we filter
 * them by data fields. Keeping one canonical id keeps that match
 * trivial regardless of which content type the push refers to.
 */

export type ContentType = 'post' | 'comment' | 'thread' | 'rideRequest'

export interface ContentRef {
  contentType: ContentType
  contentId: string
}

export function notifIdFor(ref: ContentRef): string {
  return `${ref.contentType}:${ref.contentId}`
}

/**
 * Derive the most specific content ref from a push payload's data
 * object. Used by the client when sweeping the OS tray — if a push
 * refers to a comment, that takes precedence over the post it was on
 * (deleting the comment alone shouldn't clear notifications for the
 * post itself).
 */
export function refFromPushData(
  data: Record<string, string> | undefined | null,
): ContentRef | null {
  if (!data) return null
  if (data.commentId)     return { contentType: 'comment',     contentId: data.commentId }
  if (data.threadId)      return { contentType: 'thread',      contentId: data.threadId }
  if (data.rideRequestId) return { contentType: 'rideRequest', contentId: data.rideRequestId }
  if (data.postId)        return { contentType: 'post',        contentId: data.postId }
  return null
}

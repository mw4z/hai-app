import { db } from '@/lib/db'
import { NotificationType } from '@prisma/client'
import crypto from 'crypto'
import { loadApnsCredentials, sendApnsBatch } from '@/lib/apns'
import { loadFcmCredentials } from '@/lib/fcm'
import { notifIdFor, type ContentRef } from '@/lib/pushMeta'

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

  // Snapshot which users had a bell row for this content BEFORE we
  // delete them, so the OS-level cleanup push (next step) knows which
  // devices to nudge. Done in the same await chain so by the time we
  // fire pushes the DB rows are gone — receivers that hit
  // /api/notifications/active-refs after the push will see the ref as
  // already-stale.
  const recipients = await db.notification.findMany({
    where: { OR: orClauses },
    select: { userId: true },
    distinct: ['userId'],
  })

  const result = await db.notification.deleteMany({
    where: { OR: orClauses },
  })

  // Fire OS-level cleanup pushes (best effort — silent / data-only
  // payloads, throttled by the OS). Don't await: the caller's API
  // response shouldn't block on push delivery.
  const userIds = recipients.map((r) => r.userId)
  for (const ref of contentRefsFromQuery(refs)) {
    if (userIds.length > 0) {
      void sendCleanupPush(userIds, ref).catch((err) => {
        console.warn('[NOTIF] cleanup push failed:', (err as Error)?.message)
      })
    }
  }

  return result.count
}

function contentRefsFromQuery(refs: {
  postId?: string
  commentId?: string
  threadId?: string
  rideRequestId?: string
}): ContentRef[] {
  const out: ContentRef[] = []
  if (refs.postId) out.push({ contentType: 'post', contentId: refs.postId })
  if (refs.commentId) out.push({ contentType: 'comment', contentId: refs.commentId })
  if (refs.threadId) out.push({ contentType: 'thread', contentId: refs.threadId })
  if (refs.rideRequestId) out.push({ contentType: 'rideRequest', contentId: refs.rideRequestId })
  return out
}

/**
 * OS-level notification cleanup.
 *
 * iOS path — replacement banner via apns-collapse-id:
 *   The previous "send a silent push and clear from JS" approach
 *   failed in production because Apple throttles silent pushes
 *   (apns-push-type: background) so aggressively that they're
 *   typically held in a queue until the app foregrounds. The
 *   user's diagnostic confirmed: cleanup pushes fired in foreground
 *   tests but never arrived when the app was backgrounded — the
 *   notification only cleared on next app open via sweepStaleTray.
 *
 *   Switched to the same approach WhatsApp/Telegram/iMessage use:
 *   send a regular ALERT push with the SAME apns-collapse-id as
 *   the original notification. iOS replaces the existing banner
 *   in Notification Center / lock screen with this new minimal
 *   one (title "🗑️", empty body). The replacement is reliable
 *   because alert pushes are not throttled. Combined with
 *   `content-available: 1` so iOS also wakes the app, our
 *   AppDelegate's native cleanup handler removes the replacement
 *   banner too, leaving Notification Center clean (best case)
 *   or showing a brief "🗑️" placeholder (worst case for killed
 *   apps until next open).
 *
 * Android path — data-only FCM message:
 *   Capacitor's FirebaseMessagingService fires
 *   `pushNotificationReceived` for data-only messages even when
 *   the app process is suspended (re-spawning briefly). The JS
 *   handler in PushRegistration runs removeDeliveredByRef. If
 *   the process is fully killed, sweepStaleTray on next open
 *   covers the case.
 */
export async function sendCleanupPush(
  userIds: string[],
  ref: ContentRef,
): Promise<void> {
  if (userIds.length === 0) return

  const tokens = await db.deviceToken.findMany({
    where: { userId: { in: userIds } },
    select: { token: true, platform: true },
  })
  if (tokens.length === 0) return

  const apnsCreds = loadApnsCredentials()
  const iosTokens = apnsCreds
    ? tokens.filter((t) => t.platform === 'ios').map((t) => t.token)
    : []
  const otherTokens = apnsCreds
    ? tokens.filter((t) => t.platform !== 'ios').map((t) => t.token)
    : tokens.map((t) => t.token)

  const notifId = notifIdFor(ref)
  const data = {
    cleanup: 'true',
    contentType: ref.contentType,
    contentId: ref.contentId,
    notificationId: notifId,
  }

  const sends: Promise<unknown>[] = []
  if (iosTokens.length > 0 && apnsCreds) {
    // Alert-replacement push, NOT silent. Same apns-collapse-id =>
    // replaces the original banner. Low priority so iOS doesn't
    // beep/vibrate. content-available: 1 => AppDelegate's native
    // cleanup runs to remove the replacement banner too.
    sends.push(
      sendApnsCleanupAlert(iosTokens, notifId, data, apnsCreds),
    )
  }
  if (otherTokens.length > 0) {
    sends.push(sendFcmCleanup(otherTokens, notifId, data))
  }
  await Promise.all(sends).catch(() => { /* best effort */ })
}

// Minimal APNs alert push for the cleanup path. Lives here instead of
// in sendApnsBatch so we don't have to fork that function's payload
// assembly to support hybrid alert + content-available + low priority.
//
// Why an alert push (not silent): silent pushes (apns-push-type:
// background) are throttled aggressively and don't deliver
// reliably when the app is backgrounded. Alert pushes always
// deliver. The trade-off is a brief banner flash — handled by the
// AppDelegate native handler which removes all matching delivered
// notifications (including this replacement) within ~1s.
//
// No apns-collapse-id: each new message also has no collapse-id
// (so multiple messages stack instead of replacing each other).
// The cleanup mechanism therefore can't rely on collapse to remove
// the originals — instead, AppDelegate's
// removeDeliveredNotificationsNatively iterates ALL delivered
// banners matching contentType + contentId and clears them.
async function sendApnsCleanupAlert(
  tokens: string[],
  _notifId: string, // unused now — kept for signature stability
  data: Record<string, string>,
  creds: ReturnType<typeof loadApnsCredentials>,
): Promise<void> {
  if (!creds || tokens.length === 0) return
  const { mintApnsJwt } = await import('@/lib/apns')
  const jwt = mintApnsJwt(creds)
  const host = creds.env === 'development'
    ? 'api.sandbox.push.apple.com'
    : 'api.push.apple.com'

  const payload = {
    aps: {
      // Minimal alert content. The user may briefly see "🗑️" before
      // the AppDelegate handler clears it.
      alert: { title: '🗑️', body: ' ' },
      'content-available': 1,
      'mutable-content': 1,
    },
    ...data,
  }
  const jsonBody = JSON.stringify(payload)

  const http2 = await import('http2')
  const session = http2.connect(`https://${host}`)
  try {
    await new Promise<void>((resolve) => {
      session.once('connect', () => resolve())
      session.once('error', () => resolve())
      setTimeout(resolve, 8000)
    })
  } catch { /* ignore */ }

  const sendOne = (token: string) => new Promise<void>((resolve) => {
    const headers: Record<string, string> = {
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': creds.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '5', // Low — no beep, still reliably delivered.
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(jsonBody)),
    }
    const req = session.request(headers)
    req.on('response', () => { /* ignore status — best effort */ })
    req.on('end', resolve)
    req.on('error', () => resolve())
    req.end(jsonBody)
  })

  try {
    await Promise.all(tokens.map(sendOne))
  } finally {
    try { session.close() } catch {}
  }
}

// ── Minimal FCM v1 sender for data-only cleanup pushes ───────────────────
// Doesn't share code with the full sender in process-notifs/route.ts
// because that one ships from a route handler; importing it from a
// library module is awkward. The cleanup payload is small enough that
// duplicating the auth + send loop here costs less than the refactor.
let cachedFcmToken: { token: string; expiresAt: number } | null = null
async function getFcmAccessTokenLib(): Promise<string> {
  if (cachedFcmToken && cachedFcmToken.expiresAt > Date.now() + 60_000) {
    return cachedFcmToken.token
  }
  const creds = loadFcmCredentials()
  if (!creds) throw new Error('FCM credentials not configured')
  const nowSec = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: creds.clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  }
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const toSign = `${enc(header)}.${enc(claim)}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(toSign)
  const signature = signer.sign(creds.privateKey).toString('base64url')
  const jwt = `${toSign}.${signature}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) throw new Error(`FCM OAuth failed: ${res.status}`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedFcmToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return data.access_token
}

async function sendFcmCleanup(
  tokens: string[],
  notifId: string,
  data: Record<string, string>,
): Promise<void> {
  const creds = loadFcmCredentials()
  if (!creds) return
  const accessToken = await getFcmAccessTokenLib()
  const url = `https://fcm.googleapis.com/v1/projects/${creds.projectId}/messages:send`
  const sendOne = async (token: string) => {
    const body = {
      message: {
        token,
        // No `notification` block — data-only so receivers process it
        // silently in the pushNotificationReceived handler.
        data,
        android: { priority: 'NORMAL' },
        apns: {
          headers: {
            'apns-priority': '5',
            'apns-collapse-id': notifId,
            'apns-push-type': 'background',
          },
          payload: { aps: { 'content-available': 1 } },
        },
      },
    }
    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch { /* best effort */ }
  }
  await Promise.all(tokens.map(sendOne))
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

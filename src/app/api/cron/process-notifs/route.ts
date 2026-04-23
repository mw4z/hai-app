import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import crypto from 'crypto'
import { loadFcmCredentials } from '@/lib/fcm'
import { loadApnsCredentials, sendApnsBatch } from '@/lib/apns'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── Config ────────────────────────────────────────────────────────────────
const MAX_JOBS_PER_RUN = 150
const FCM_CONCURRENCY = 25
const RETRY_DELAYS_MIN = [5, 30, 120] // minutes
const SAUDI_UTC_OFFSET_HOURS = 3 // no DST

// ── Time helpers ──────────────────────────────────────────────────────────
function currentSaudiHour(): number {
  return (new Date().getUTCHours() + SAUDI_UTC_OFFSET_HOURS) % 24
}

function isInQuietHours(start?: number | null, end?: number | null): boolean {
  if (start == null || end == null || start === end) return false
  const h = currentSaudiHour()
  return start < end ? h >= start && h < end : h >= start || h < end
}

// ── FCM OAuth (JWT-RS256 → access token) ─────────────────────────────────
interface CachedToken {
  token: string
  expiresAt: number
}
let cachedAccessToken: CachedToken | null = null

async function getFcmAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token
  }
  const creds = loadFcmCredentials()
  if (!creds) throw new Error('FCM credentials not configured')
  const { clientEmail, privateKey } = creds

  const nowSec = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  }
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const toSign = `${enc(header)}.${enc(claim)}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(toSign)
  const signature = signer.sign(privateKey).toString('base64url')
  const jwt = `${toSign}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`FCM OAuth failed: ${res.status} ${text.slice(0, 200)}`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return data.access_token
}

// ── FCM Send ─────────────────────────────────────────────────────────────
interface FcmSendResult {
  success: number
  failed: number
  invalidTokens: string[]
  firstError?: string
}

interface NotificationContent {
  title: string
  body: string
  data: Record<string, string>
  priority?: 'high' | 'normal'
  androidChannel?: string
}

/**
 * Cross-platform send. Pass tokens tagged with their platform so iOS
 * ('ios') goes to Apple's APNs HTTP/2 directly (no Firebase iOS SDK
 * required) and everything else goes through FCM v1.
 */
async function sendPushBatch(
  tokens: Array<{ token: string; platform: string }>,
  content: NotificationContent,
): Promise<FcmSendResult> {
  const iosTokens = tokens.filter((t) => t.platform === 'ios').map((t) => t.token)
  const otherTokens = tokens.filter((t) => t.platform !== 'ios').map((t) => t.token)

  const combined: FcmSendResult = { success: 0, failed: 0, invalidTokens: [] }

  if (iosTokens.length > 0) {
    const apnsCreds = loadApnsCredentials()
    if (!apnsCreds) {
      // No APNs key on the server — skip rather than fail the whole job.
      combined.failed += iosTokens.length
      if (!combined.firstError) combined.firstError = 'apns_not_configured'
    } else {
      const apns = await sendApnsBatch(iosTokens, {
        title: content.title,
        body: content.body,
        priority: content.priority === 'high' ? 'high' : 'normal',
        data: content.data,
      }, apnsCreds)
      combined.success += apns.success
      combined.failed += apns.failed
      combined.invalidTokens.push(...apns.invalidTokens)
      if (!combined.firstError && apns.firstError) combined.firstError = apns.firstError
    }
  }

  if (otherTokens.length > 0) {
    const fcm = await sendFcmBatch(otherTokens, content)
    combined.success += fcm.success
    combined.failed += fcm.failed
    combined.invalidTokens.push(...fcm.invalidTokens)
    if (!combined.firstError && fcm.firstError) combined.firstError = fcm.firstError
  }

  return combined
}

async function sendFcmBatch(
  tokens: string[],
  content: NotificationContent,
): Promise<FcmSendResult> {
  const result: FcmSendResult = { success: 0, failed: 0, invalidTokens: [] }
  if (tokens.length === 0) return result

  const creds = loadFcmCredentials()
  if (!creds) throw new Error('FCM credentials not configured')
  const projectId = creds.projectId

  const accessToken = await getFcmAccessToken()
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`
  const apnsPriority = content.priority === 'high' ? '10' : '5'
  const androidPriority = content.priority === 'high' ? 'HIGH' : 'NORMAL'

  const sendOne = async (token: string) => {
    const body = {
      message: {
        token,
        notification: { title: content.title, body: content.body },
        data: content.data,
        android: {
          priority: androidPriority,
          notification: content.androidChannel
            ? { channel_id: content.androidChannel, sound: 'default' }
            : { sound: 'default' },
        },
        apns: {
          headers: { 'apns-priority': apnsPriority },
          payload: { aps: { sound: 'default', 'mutable-content': 1 } },
        },
      },
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        result.success++
        return
      }
      result.failed++
      const errBody = (await res.json().catch(() => null)) as any
      const errCode: string | undefined =
        errBody?.error?.details?.find?.((d: any) =>
          d?.['@type']?.includes('FcmError'),
        )?.errorCode ?? errBody?.error?.status
      if (
        errCode === 'UNREGISTERED' ||
        errCode === 'NOT_FOUND' ||
        errCode === 'INVALID_ARGUMENT' ||
        res.status === 404
      ) {
        result.invalidTokens.push(token)
      }
      if (!result.firstError) {
        result.firstError = errBody?.error?.message || `HTTP ${res.status}`
      }
    } catch (err: any) {
      result.failed++
      if (!result.firstError) result.firstError = err?.message || String(err)
    }
  }

  for (let i = 0; i < tokens.length; i += FCM_CONCURRENCY) {
    const chunk = tokens.slice(i, i + FCM_CONCURRENCY)
    await Promise.all(chunk.map(sendOne))
  }
  return result
}

// ── Token resolvers ──────────────────────────────────────────────────────
interface TokenWithPlatform { token: string; platform: string }
interface ResolvedTokens {
  tokens: TokenWithPlatform[]
  recipientUserCount: number
}

async function resolveNewPostTokens(
  neighborhoodId: string,
  authorId: string,
  category: string,
): Promise<ResolvedTokens> {
  const genderFilter =
    category === 'WOMEN_ONLY' ? ({ gender: 'FEMALE' } as const) : {}

  const users = await db.user.findMany({
    where: {
      neighborhoodId,
      id: { not: authorId },
      status: { notIn: ['BANNED_TEMP', 'BANNED_PERM'] },
      ...genderFilter,
    },
    select: {
      id: true,
      deviceTokens: { select: { token: true, platform: true } },
      notifPreference: {
        select: {
          newPostInNbhd: true,
          quietStartHr: true,
          quietEndHr: true,
        },
      },
    },
  })

  const tokens: TokenWithPlatform[] = []
  let recipientUserCount = 0
  for (const u of users) {
    const pref = u.notifPreference
    if (pref && pref.newPostInNbhd === false) continue
    if (pref && isInQuietHours(pref.quietStartHr, pref.quietEndHr)) continue
    if (!u.deviceTokens.length) continue
    recipientUserCount++
    for (const dt of u.deviceTokens) tokens.push({ token: dt.token, platform: dt.platform || "android" })
  }
  return { tokens, recipientUserCount }
}

type SingleUserPrefKey =
  | 'commentOnYours'
  | 'replyOnYours'
  | 'reactionOnYours'
  | 'weeklyDigest'
  | 'directMessage'

async function resolveUserTokens(
  userId: string,
  prefKey: SingleUserPrefKey,
): Promise<{ tokens: TokenWithPlatform[]; userExists: boolean }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      deviceTokens: { select: { token: true, platform: true } },
      notifPreference: {
        select: {
          commentOnYours: true,
          replyOnYours: true,
          reactionOnYours: true,
          weeklyDigest: true,
          directMessage: true,
          quietStartHr: true,
          quietEndHr: true,
        },
      },
    },
  })

  if (!user) return { tokens: [] as TokenWithPlatform[], userExists: false }
  if (user.status === 'BANNED_TEMP' || user.status === 'BANNED_PERM') {
    return { tokens: [] as TokenWithPlatform[], userExists: true }
  }
  const pref = user.notifPreference
  if (pref && pref[prefKey] === false) return { tokens: [] as TokenWithPlatform[], userExists: true }
  if (pref && isInQuietHours(pref.quietStartHr, pref.quietEndHr)) {
    return { tokens: [] as TokenWithPlatform[], userExists: true }
  }
  if (!user.deviceTokens.length) return { tokens: [] as TokenWithPlatform[], userExists: true }

  return { tokens: user.deviceTokens.map((dt) => ({ token: dt.token, platform: dt.platform || "android" })), userExists: true }
}

async function resolveEmergencyTokens(
  neighborhoodId: string,
): Promise<ResolvedTokens> {
  const users = await db.user.findMany({
    where: {
      neighborhoodId,
      status: { notIn: ['BANNED_TEMP', 'BANNED_PERM'] },
    },
    select: {
      id: true,
      deviceTokens: { select: { token: true, platform: true } },
    },
  })

  const tokens: TokenWithPlatform[] = []
  let recipientUserCount = 0
  for (const u of users) {
    if (!u.deviceTokens.length) continue
    recipientUserCount++
    for (const dt of u.deviceTokens) tokens.push({ token: dt.token, platform: dt.platform || "android" })
  }
  return { tokens, recipientUserCount }
}

async function cleanupInvalidTokens(
  tokens: string[],  // raw invalid token strings returned by FCM/APNs
  jobId: string,
  type: string,
): Promise<void> {
  if (!tokens.length) return
  try {
    const del = await db.deviceToken.deleteMany({
      where: { token: { in: tokens } },
    })
    console.log('[NOTIF_CRON] invalid token cleanup', {
      jobId,
      type,
      removed: del.count,
    })
  } catch (err) {
    console.error('[NOTIF_CRON] token cleanup error', { jobId, type, err })
  }
}

// ── Per-type processors ──────────────────────────────────────────────────
type JobOutcome = 'done' | 'dropped'

interface JobRow {
  id: string
  type: string
  priority: string
  targetType: string
  targetRef: string
  payload: any
  attempts: number
  maxAttempts: number
}

const CATEGORY_LABEL_AR: Record<string, string> = {
  ALERT: 'تنبيه',
  NEIGHBORHOOD_ISSUE: 'مشكلة بالحي',
  LOST_FOUND: 'مفقودات',
  MARKETPLACE: 'سوق',
  FOOD_HOME: 'طبخ منزلي',
  REAL_ESTATE: 'عقار',
  SERVICES: 'خدمة',
  LOOKING_FOR: 'أبحث عن',
  MOSQUE: 'مسجد',
  EID_RAMADAN: 'مناسبات',
  CONTESTS: 'مسابقة',
  RIDE_REQUEST: 'توصيل',
  WOMEN_ONLY: 'للنساء',
  GENERAL: 'عام',
}

async function processNewPost(job: JobRow): Promise<JobOutcome> {
  const p = (job.payload || {}) as {
    postId?: string
    authorId?: string
    authorName?: string | null
    title?: string
    category?: string
  }
  const { postId, authorId, authorName, title, category } = p

  if (!postId || !authorId || !title || !category) {
    console.log('[NOTIF_CRON] drop: invalid new_post payload', { jobId: job.id })
    return 'dropped'
  }

  const post = await db.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      status: true,
      neighborhoodId: true,
      author: { select: { id: true, status: true } },
    },
  })
  if (!post) return 'dropped'
  if (post.status !== 'ACTIVE' && post.status !== 'IN_PROGRESS') return 'dropped'
  if (post.author.status === 'BANNED_TEMP' || post.author.status === 'BANNED_PERM') {
    return 'dropped'
  }
  if (post.neighborhoodId !== job.targetRef) return 'dropped'

  const { tokens, recipientUserCount } = await resolveNewPostTokens(
    job.targetRef,
    authorId,
    category,
  )
  if (tokens.length === 0) {
    console.log('[NOTIF_CRON] drop: no recipients (new_post)', { jobId: job.id })
    return 'dropped'
  }

  const author = authorName?.trim() || 'جار'
  const catLabel = CATEGORY_LABEL_AR[category] || ''
  const pushTitle = catLabel ? `${author} · ${catLabel}` : author
  const pushBody = title.slice(0, 180)

  const result = await sendPushBatch(tokens, {
    title: pushTitle,
    body: pushBody,
    priority: 'normal',
    data: {
      type: 'new_post',
      postId,
      category,
      deeplink: `hai://post/${postId}`,
    },
  })

  await cleanupInvalidTokens(result.invalidTokens, job.id, job.type)

  console.log('[NOTIF_CRON] job delivered', {
    jobId: job.id,
    type: job.type,
    targetRef: job.targetRef,
    attempts: job.attempts,
    recipients: recipientUserCount,
    tokensSent: tokens.length,
    success: result.success,
    failed: result.failed,
  })

  if (result.success === 0 && result.failed > 0) {
    throw new Error(result.firstError || 'all FCM sends failed')
  }
  return 'done'
}

async function processCommentOnPost(job: JobRow): Promise<JobOutcome> {
  const p = (job.payload || {}) as {
    postId?: string
    commentId?: string
    actorId?: string
    actorName?: string | null
    postAuthorId?: string
    snippet?: string
  }
  const { postId, commentId, actorId, actorName, postAuthorId, snippet } = p
  if (!postId || !commentId || !actorId || !postAuthorId) return 'dropped'

  const [post, comment] = await Promise.all([
    db.post.findUnique({
      where: { id: postId },
      select: { id: true, status: true, authorId: true },
    }),
    db.comment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true },
    }),
  ])
  if (!post || !comment) return 'dropped'
  if (comment.postId !== postId) return 'dropped'
  if (post.status !== 'ACTIVE' && post.status !== 'IN_PROGRESS') return 'dropped'
  if (post.authorId !== postAuthorId) return 'dropped'
  if (postAuthorId === actorId) return 'dropped'

  const { tokens, userExists } = await resolveUserTokens(
    job.targetRef,
    'commentOnYours',
  )
  if (!userExists) return 'dropped'
  if (tokens.length === 0) return 'dropped'

  const actor = actorName?.trim() || 'جار'
  const pushTitle = `${actor} علّق على منشورك`
  const pushBody = (snippet || '').trim().slice(0, 180) || 'اضغط للعرض'

  const result = await sendPushBatch(tokens, {
    title: pushTitle,
    body: pushBody,
    priority: 'normal',
    data: {
      type: 'comment_on_post',
      postId,
      commentId,
      deeplink: `hai://post/${postId}?comment=${commentId}`,
    },
  })

  await cleanupInvalidTokens(result.invalidTokens, job.id, job.type)

  console.log('[NOTIF_CRON] job delivered', {
    jobId: job.id,
    type: job.type,
    targetRef: job.targetRef,
    attempts: job.attempts,
    tokensSent: tokens.length,
    success: result.success,
    failed: result.failed,
  })

  if (result.success === 0 && result.failed > 0) {
    throw new Error(result.firstError || 'all FCM sends failed')
  }
  return 'done'
}

async function processReplyToComment(job: JobRow): Promise<JobOutcome> {
  const p = (job.payload || {}) as {
    postId?: string
    commentId?: string
    parentCommentId?: string
    actorId?: string
    actorName?: string | null
    recipientId?: string
    snippet?: string
  }
  const {
    postId,
    commentId,
    parentCommentId,
    actorId,
    actorName,
    recipientId,
    snippet,
  } = p
  if (!postId || !commentId || !parentCommentId || !actorId || !recipientId) {
    return 'dropped'
  }
  if (recipientId === actorId) return 'dropped'
  if (job.targetRef !== recipientId) return 'dropped'

  const [post, reply, parent] = await Promise.all([
    db.post.findUnique({
      where: { id: postId },
      select: { id: true, status: true },
    }),
    db.comment.findUnique({
      where: { id: commentId },
      select: { id: true, postId: true, parentId: true },
    }),
    db.comment.findUnique({
      where: { id: parentCommentId },
      select: { id: true, authorId: true },
    }),
  ])
  if (!post || !reply || !parent) return 'dropped'
  if (reply.postId !== postId || reply.parentId !== parentCommentId) return 'dropped'
  if (parent.authorId !== recipientId) return 'dropped'
  if (post.status !== 'ACTIVE' && post.status !== 'IN_PROGRESS') return 'dropped'

  const { tokens, userExists } = await resolveUserTokens(
    recipientId,
    'replyOnYours',
  )
  if (!userExists) return 'dropped'
  if (tokens.length === 0) return 'dropped'

  const actor = actorName?.trim() || 'جار'
  const pushTitle = `${actor} رد على تعليقك`
  const pushBody = (snippet || '').trim().slice(0, 180) || 'اضغط للعرض'

  const result = await sendPushBatch(tokens, {
    title: pushTitle,
    body: pushBody,
    priority: 'normal',
    data: {
      type: 'reply_to_comment',
      postId,
      commentId,
      parentCommentId,
      deeplink: `hai://post/${postId}?comment=${commentId}`,
    },
  })

  await cleanupInvalidTokens(result.invalidTokens, job.id, job.type)

  console.log('[NOTIF_CRON] job delivered', {
    jobId: job.id,
    type: job.type,
    targetRef: job.targetRef,
    attempts: job.attempts,
    tokensSent: tokens.length,
    success: result.success,
    failed: result.failed,
  })

  if (result.success === 0 && result.failed > 0) {
    throw new Error(result.firstError || 'all FCM sends failed')
  }
  return 'done'
}

async function processReactionOnPost(job: JobRow): Promise<JobOutcome> {
  const p = (job.payload || {}) as {
    postId?: string
    recipientId?: string
    actorIds?: string[]
    actorNames?: (string | null)[]
    count?: number
  }
  const { postId, recipientId } = p
  const actorIds = Array.isArray(p.actorIds) ? p.actorIds : []
  const actorNames = Array.isArray(p.actorNames) ? p.actorNames : []
  const count = typeof p.count === 'number' ? p.count : actorIds.length

  if (!postId || !recipientId || count < 1) return 'dropped'
  if (job.targetRef !== recipientId) return 'dropped'

  const post = await db.post.findUnique({
    where: { id: postId },
    select: { id: true, status: true, authorId: true },
  })
  if (!post) return 'dropped'
  if (post.status !== 'ACTIVE' && post.status !== 'IN_PROGRESS') return 'dropped'
  if (post.authorId !== recipientId) return 'dropped'

  const { tokens, userExists } = await resolveUserTokens(
    recipientId,
    'reactionOnYours',
  )
  if (!userExists) return 'dropped'
  if (tokens.length === 0) return 'dropped'

  let pushTitle: string
  if (count === 1) {
    const actor = (actorNames[0] || '').trim() || 'جار'
    pushTitle = `${actor} تفاعل مع منشورك`
  } else {
    pushTitle = `${count} جيران تفاعلوا مع منشورك`
  }
  const pushBody = 'اضغط للعرض'

  const result = await sendPushBatch(tokens, {
    title: pushTitle,
    body: pushBody,
    priority: 'normal',
    data: {
      type: 'reaction_on_post',
      postId,
      count: String(count),
      deeplink: `hai://post/${postId}`,
    },
  })

  await cleanupInvalidTokens(result.invalidTokens, job.id, job.type)

  console.log('[NOTIF_CRON] job delivered', {
    jobId: job.id,
    type: job.type,
    targetRef: job.targetRef,
    attempts: job.attempts,
    actorCount: count,
    tokensSent: tokens.length,
    success: result.success,
    failed: result.failed,
  })

  if (result.success === 0 && result.failed > 0) {
    throw new Error(result.firstError || 'all FCM sends failed')
  }
  return 'done'
}

async function processWeeklyDigest(job: JobRow): Promise<JobOutcome> {
  const p = (job.payload || {}) as {
    weekStart?: string
    neighborhoodId?: string
    neighborhoodPostCount?: number
    myCommentsReceived?: number
    myReactionsReceived?: number
    topPostId?: string | null
  }
  const {
    weekStart,
    neighborhoodId,
    neighborhoodPostCount = 0,
    myCommentsReceived = 0,
    myReactionsReceived = 0,
    topPostId,
  } = p
  if (!weekStart || !neighborhoodId) return 'dropped'

  const recipientId = job.targetRef
  const user = await db.user.findUnique({
    where: { id: recipientId },
    select: { id: true, status: true, neighborhoodId: true },
  })
  if (!user) return 'dropped'
  if (user.status === 'BANNED_TEMP' || user.status === 'BANNED_PERM') return 'dropped'
  if (user.neighborhoodId !== neighborhoodId) return 'dropped'

  let validTopPostId: string | null = null
  if (topPostId) {
    const top = await db.post.findUnique({
      where: { id: topPostId },
      select: { id: true, status: true },
    })
    if (top && (top.status === 'ACTIVE' || top.status === 'IN_PROGRESS')) {
      validTopPostId = top.id
    }
  }

  const { tokens, userExists } = await resolveUserTokens(recipientId, 'weeklyDigest')
  if (!userExists) return 'dropped'
  if (tokens.length === 0) return 'dropped'

  const personalCount = myCommentsReceived + myReactionsReceived
  const pushTitle = 'ملخص الأسبوع في حيّك'
  let pushBody: string
  if (personalCount > 0 && neighborhoodPostCount > 0) {
    pushBody = `${neighborhoodPostCount} منشور جديد و ${personalCount} تفاعل على نشاطك`
  } else if (personalCount > 0) {
    pushBody = `${personalCount} تفاعل جديد على نشاطك هذا الأسبوع`
  } else if (neighborhoodPostCount >= 3) {
    pushBody = `${neighborhoodPostCount} منشور جديد في حيّك هذا الأسبوع`
  } else {
    pushBody = 'نشاط جديد في الحي خلال الأسبوع الماضي'
  }

  const result = await sendPushBatch(tokens, {
    title: pushTitle,
    body: pushBody,
    priority: 'normal',
    data: {
      type: 'weekly_digest',
      weekStart,
      ...(validTopPostId ? { postId: validTopPostId } : {}),
      deeplink: validTopPostId ? `hai://post/${validTopPostId}` : 'hai://feed',
    },
  })

  await cleanupInvalidTokens(result.invalidTokens, job.id, job.type)

  console.log('[NOTIF_CRON] job delivered', {
    jobId: job.id,
    type: job.type,
    targetRef: job.targetRef,
    attempts: job.attempts,
    tokensSent: tokens.length,
    success: result.success,
    failed: result.failed,
  })

  if (result.success === 0 && result.failed > 0) {
    throw new Error(result.firstError || 'all FCM sends failed')
  }
  return 'done'
}

async function processEmergencyAlert(job: JobRow): Promise<JobOutcome> {
  const p = (job.payload || {}) as { alertId?: string }
  if (!p.alertId) return 'dropped'

  const alert = await db.emergencyAlert.findUnique({
    where: { id: p.alertId },
    select: {
      id: true,
      title: true,
      body: true,
      severity: true,
      neighborhoodId: true,
      revokedAt: true,
      expiresAt: true,
    },
  })
  if (!alert) return 'dropped'
  if (alert.revokedAt) return 'dropped'
  if (alert.expiresAt.getTime() <= Date.now()) return 'dropped'
  if (alert.neighborhoodId !== job.targetRef) return 'dropped'

  const { tokens, recipientUserCount } = await resolveEmergencyTokens(
    alert.neighborhoodId,
  )
  if (tokens.length === 0) return 'dropped'

  const pushTitle = '🚨 تنبيه عاجل'
  const pushBody = (alert.title || alert.body || '').slice(0, 180)

  const result = await sendPushBatch(tokens, {
    title: pushTitle,
    body: pushBody,
    priority: 'high',
    androidChannel: 'emergency',
    data: {
      type: 'emergency_alert',
      alertId: alert.id,
      severity: alert.severity,
      deeplink: `hai://emergency/${alert.id}`,
    },
  })

  await cleanupInvalidTokens(result.invalidTokens, job.id, job.type)

  console.log('[NOTIF_CRON] job delivered', {
    jobId: job.id,
    type: job.type,
    targetRef: job.targetRef,
    attempts: job.attempts,
    recipients: recipientUserCount,
    tokensSent: tokens.length,
    success: result.success,
    failed: result.failed,
  })

  if (result.success === 0 && result.failed > 0) {
    throw new Error(result.firstError || 'all FCM sends failed')
  }
  return 'done'
}

// ── Main handler ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  return handle(req)
}
export async function POST(req: NextRequest) {
  return handle(req)
}

async function handle(req: NextRequest) {
  // Cron auth: accept Vercel's x-vercel-cron header OR explicit bearer token
  const isVercelCron = req.headers.get('x-vercel-cron') != null
  const auth = req.headers.get('authorization') || ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron) {
    if (!expected || auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const summary = {
    ok: true,
    processed: 0,
    done: 0,
    dropped: 0,
    failed: 0,
    retried: 0,
  }

  const now = new Date()
  let claimedIds: string[] = []
  try {
    claimedIds = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "NotifJob"
        WHERE status = 'pending' AND "runAt" <= ${now}
        ORDER BY
          CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
          "runAt" ASC
        LIMIT ${MAX_JOBS_PER_RUN}
        FOR UPDATE SKIP LOCKED
      `
      if (rows.length === 0) return []
      const ids = rows.map((r) => r.id)
      await tx.notifJob.updateMany({
        where: { id: { in: ids } },
        data: { status: 'running', attempts: { increment: 1 } },
      })
      return ids
    })
  } catch (err) {
    console.error('[NOTIF_CRON] claim failed', err)
    return NextResponse.json(
      { ...summary, ok: false, error: 'claim_failed' },
      { status: 500 },
    )
  }

  if (claimedIds.length === 0) {
    return NextResponse.json(summary)
  }

  const jobs = (await db.notifJob.findMany({
    where: { id: { in: claimedIds } },
  })) as unknown as JobRow[]

  for (const job of jobs) {
    summary.processed++
    console.log('[NOTIF_CRON] job start', {
      jobId: job.id,
      type: job.type,
      attempts: job.attempts,
      targetRef: job.targetRef,
    })

    try {
      let outcome: JobOutcome = 'dropped'
      switch (job.type) {
        case 'new_post':
          outcome = await processNewPost(job)
          break
        case 'comment_on_post':
          outcome = await processCommentOnPost(job)
          break
        case 'reply_to_comment':
          outcome = await processReplyToComment(job)
          break
        case 'reaction_on_post':
          outcome = await processReactionOnPost(job)
          break
        case 'weekly_digest':
          outcome = await processWeeklyDigest(job)
          break
        case 'emergency_alert':
          outcome = await processEmergencyAlert(job)
          break
        default:
          console.warn('[NOTIF_CRON] unsupported type', {
            jobId: job.id,
            type: job.type,
          })
          outcome = 'dropped'
      }

      if (outcome === 'done') {
        summary.done++
        await db.notifJob.update({
          where: { id: job.id },
          data: { status: 'done', processedAt: new Date(), lastError: null },
        })
      } else {
        summary.dropped++
        await db.notifJob.update({
          where: { id: job.id },
          data: { status: 'dropped', processedAt: new Date() },
        })
      }
    } catch (err: any) {
      const msg = (err?.message || String(err)).slice(0, 500)
      if (job.attempts >= job.maxAttempts) {
        summary.failed++
        console.error('[NOTIF_CRON] job failed', {
          jobId: job.id,
          type: job.type,
          attempts: job.attempts,
          error: msg,
        })
        await db.notifJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            lastError: msg,
            processedAt: new Date(),
          },
        })
      } else {
        summary.retried++
        const idx = Math.min(job.attempts - 1, RETRY_DELAYS_MIN.length - 1)
        const nextRun = new Date(
          Date.now() + RETRY_DELAYS_MIN[Math.max(idx, 0)] * 60_000,
        )
        console.warn('[NOTIF_CRON] job retry scheduled', {
          jobId: job.id,
          type: job.type,
          attempts: job.attempts,
          nextRunAt: nextRun.toISOString(),
          error: msg,
        })
        await db.notifJob.update({
          where: { id: job.id },
          data: { status: 'pending', runAt: nextRun, lastError: msg },
        })
      }
    }
  }

  return NextResponse.json(summary)
}

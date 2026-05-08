import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { loadApnsCredentials, sendApnsBatch } from '@/lib/apns'
import { sendCleanupPush } from '@/lib/notifications'
import { notifIdFor } from '@/lib/pushMeta'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * End-to-end diagnostic for the OS-notification-cleanup chain.
 *
 *   POST /api/debug/revoke-notifs  { action: 'alert'   }
 *        → Sends a real ALERT push to every device registered to the
 *          caller. The push carries refs = { contentType: 'thread',
 *          contentId: TEST_<ts> } and gets a stable apns-collapse-id
 *          / Android tag. Use this to verify a notification appears
 *          in the OS tray with `data.contentType`/`data.contentId`
 *          set.
 *
 *   POST /api/debug/revoke-notifs  { action: 'cleanup', ref }
 *        → Sends a silent CLEANUP push (apns-push-type: background +
 *          content-available: 1, Android data-only) for the given
 *          ref. Use this to verify the silent push delivers and the
 *          client's handler fires removeDeliveredByRef.
 *
 *   POST /api/debug/revoke-notifs  { action: 'self-test' }
 *        → Convenience: alert + 2s wait + cleanup, all targeted at
 *          the same TEST contentId. The phone should show the alert
 *          banner, then watch it disappear when the cleanup push
 *          arrives.
 *
 * Any signed-in user can call it. The push only ever targets the
 * caller's own devices.
 */

interface AlertReq { action: 'alert' }
interface CleanupReq {
  action: 'cleanup'
  ref: { contentType: 'post' | 'comment' | 'thread' | 'rideRequest'; contentId: string }
}
interface SelfTestReq { action: 'self-test' }

type Req = AlertReq | CleanupReq | SelfTestReq

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Req
  try {
    body = (await req.json()) as Req
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const tokens = await db.deviceToken.findMany({
    where: { userId: session.userId },
    select: { token: true, platform: true },
  })
  if (tokens.length === 0) {
    return NextResponse.json({
      ok: false,
      reason: 'no_devices',
      summary: 'No registered devices for this account.',
    })
  }

  if (body.action === 'alert') {
    return await sendAlert(tokens)
  }
  if (body.action === 'cleanup') {
    if (!body.ref?.contentType || !body.ref?.contentId) {
      return NextResponse.json({ error: 'invalid_ref' }, { status: 400 })
    }
    await sendCleanupPush([session.userId], body.ref)
    return NextResponse.json({
      ok: true,
      summary: `Sent silent cleanup push for ${body.ref.contentType}:${body.ref.contentId} to ${tokens.length} device(s).`,
      tokensTargeted: tokens.length,
    })
  }
  if (body.action === 'self-test') {
    const testId = `TEST_${Date.now()}`
    const ref = { contentType: 'thread' as const, contentId: testId }
    const alertResult = await sendAlertWithRef(tokens, ref)
    // Wait 2s so the device has time to receive + display the alert
    // before we fire the cleanup push (otherwise the cleanup may
    // arrive first and the client has nothing in deliveredNotifications
    // to remove).
    await new Promise((r) => setTimeout(r, 2000))
    await sendCleanupPush([session.userId], ref)
    return NextResponse.json({
      ok: true,
      summary: `Sent test alert (id=${testId}) + cleanup push to ${tokens.length} device(s). The alert banner should appear and then disappear within ~2-5s.`,
      ref,
      tokensTargeted: tokens.length,
      alertResult,
    })
  }

  return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
}

async function sendAlert(
  tokens: Array<{ token: string; platform: string }>,
) {
  const ref = { contentType: 'thread' as const, contentId: `TEST_${Date.now()}` }
  const result = await sendAlertWithRef(tokens, ref)
  return NextResponse.json({
    ok: true,
    summary: `Sent test alert (id=${ref.contentId}) to ${tokens.length} device(s). Check the device's notification center — the data field should contain contentType=${ref.contentType} and contentId=${ref.contentId}.`,
    ref,
    tokensTargeted: tokens.length,
    result,
  })
}

/** Direct-to-APNs / FCM alert with refs attached. Mirrors what the
 *  cron's processNewMessage path produces, minus the title/body
 *  customisation — kept inline so this endpoint doesn't pull the
 *  whole sendPushBatch from the cron route. */
async function sendAlertWithRef(
  tokens: Array<{ token: string; platform: string }>,
  ref: { contentType: 'thread'; contentId: string },
) {
  const apnsCreds = loadApnsCredentials()
  const notifId = notifIdFor(ref)
  const data = {
    type: 'debug_revoke_test',
    threadId: ref.contentId, // legacy field for older clients
    contentType: ref.contentType,
    contentId: ref.contentId,
    notificationId: notifId,
    deeplink: `hai://threads/${ref.contentId}`,
  }
  const title = '🧪 Revoke test'
  const body = `id=${ref.contentId}`

  const out: Record<string, unknown> = {
    iosAttempted: 0, iosSuccess: 0, iosFailed: 0, iosFirstError: null,
    fcmAttempted: 0, fcmSuccess: 0, fcmFailed: 0, fcmFirstError: null,
  }

  const iosTokens = apnsCreds
    ? tokens.filter((t) => t.platform === 'ios').map((t) => t.token)
    : []
  const otherTokens = apnsCreds
    ? tokens.filter((t) => t.platform !== 'ios').map((t) => t.token)
    : tokens.map((t) => t.token)

  if (iosTokens.length > 0 && apnsCreds) {
    const apns = await sendApnsBatch(
      iosTokens,
      { title, body, data, priority: 'high', collapseId: notifId },
      apnsCreds,
    )
    out.iosAttempted = iosTokens.length
    out.iosSuccess = apns.success
    out.iosFailed = apns.failed
    out.iosFirstError = apns.firstError ?? null
  }

  if (otherTokens.length > 0) {
    const fcm = await sendFcmAlertInline(otherTokens, title, body, data, notifId)
    out.fcmAttempted = otherTokens.length
    out.fcmSuccess = fcm.success
    out.fcmFailed = fcm.failed
    out.fcmFirstError = fcm.firstError ?? null
  }

  return out
}

// Minimal data + notification FCM v1 sender for the diagnostic. Mirrors
// the production sender's shape (notification block + data + tag) so
// the test push behaves the same as a real new-message push.
async function sendFcmAlertInline(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string>,
  notifId: string,
): Promise<{ success: number; failed: number; firstError?: string }> {
  const { loadFcmCredentials } = await import('@/lib/fcm')
  const creds = loadFcmCredentials()
  if (!creds) return { success: 0, failed: tokens.length, firstError: 'fcm_not_configured' }

  const crypto = await import('crypto')
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

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!tokenRes.ok) {
    return { success: 0, failed: tokens.length, firstError: `oauth_${tokenRes.status}` }
  }
  const oauthData = (await tokenRes.json()) as { access_token: string }
  const accessToken = oauthData.access_token

  const url = `https://fcm.googleapis.com/v1/projects/${creds.projectId}/messages:send`
  let success = 0
  let failed = 0
  let firstError: string | undefined

  for (const token of tokens) {
    const reqBody = {
      message: {
        token,
        notification: { title, body },
        data,
        android: {
          priority: 'HIGH',
          notification: { sound: 'hai_chime', tag: notifId },
        },
        apns: {
          headers: { 'apns-priority': '10', 'apns-collapse-id': notifId },
          payload: { aps: { sound: 'hai_chime.wav', 'mutable-content': 1 } },
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
        body: JSON.stringify(reqBody),
      })
      if (res.ok) { success++ } else {
        failed++
        if (!firstError) {
          const eb = await res.json().catch(() => null) as any
          firstError = eb?.error?.message || `HTTP ${res.status}`
        }
      }
    } catch (err: any) {
      failed++
      if (!firstError) firstError = err?.message || String(err)
    }
  }

  return { success, failed, firstError }
}

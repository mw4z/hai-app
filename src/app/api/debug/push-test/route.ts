import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import crypto from 'crypto'
import { loadFcmCredentials } from '@/lib/fcm'
import { loadApnsCredentials, sendApnsBatch } from '@/lib/apns'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * End-to-end push diagnostic for the current signed-in user.
 *
 *   GET  /api/debug/push-test
 *        → snapshot: your DeviceTokens, recent NotifJob counts, FCM
 *          credential status. Pinpoints which link of the chain is
 *          broken.
 *
 *   POST /api/debug/push-test   { title?: string, body?: string }
 *        → sends a live FCM push to EVERY token registered to the
 *          caller's account, bypassing the cron/queue. If the push
 *          arrives on the phone → FCM + token + OS-level permission
 *          are all working, and any missing notification must be a
 *          cron / queue / NotifJob issue. If it doesn't → we know
 *          to look at FCM creds, APNs, or token validity.
 *
 * Any signed-in user can call it (only touches their own devices).
 */

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const [tokens, jobsByStatus] = await Promise.all([
    db.deviceToken.findMany({
      where: { userId: session.userId },
      select: {
        id: true,
        platform: true,
        deviceId: true,
        appVersion: true,
        createdAt: true,
        lastSeenAt: true,
        token: true,
      },
      orderBy: { lastSeenAt: 'desc' },
    }),
    db.notifJob.groupBy({
      by: ['status'],
      _count: { _all: true },
      where: { createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
    }),
  ])

  const fcmCreds = loadFcmCredentials()
  const apnsCreds = loadApnsCredentials()

  return NextResponse.json({
    ok: true,
    userId: session.userId,
    deviceTokens: tokens.map((t) => ({
      id: t.id,
      platform: t.platform,
      deviceId: t.deviceId,
      appVersion: t.appVersion,
      createdAt: t.createdAt,
      lastSeenAt: t.lastSeenAt,
      // Don't leak the raw token — just a short, identifying prefix
      // that's enough to confirm it changed between registrations.
      tokenPrefix: t.token.slice(0, 18) + '…',
      tokenLength: t.token.length,
    })),
    fcm: {
      configured: !!fcmCreds,
      source: fcmCreds?.source ?? null,
      projectId: fcmCreds?.projectId ?? null,
    },
    apns: {
      configured: !!apnsCreds,
      keyId: apnsCreds?.keyId ?? null,
      teamId: apnsCreds?.teamId ?? null,
      bundleId: apnsCreds?.bundleId ?? null,
      env: apnsCreds?.env ?? null,
    },
    notifJobsLast24h: jobsByStatus.map((g) => ({
      status: g.status,
      count: g._count._all,
    })),
    help: {
      registerTokenHint:
        tokens.length === 0
          ? 'No device tokens registered. Open the native app with notifications permission granted so PushRegistration can POST /api/devices/register.'
          : null,
      fcmHint: !fcmCreds
        ? 'FCM credentials missing. Set FCM_SERVICE_ACCOUNT_BASE64 (or FCM_PROJECT_ID/_CLIENT_EMAIL/_PRIVATE_KEY) in Vercel env.'
        : null,
      apnsHint: !apnsCreds && tokens.some((t) => t.platform === 'ios')
        ? 'APNs credentials missing. Set APNS_KEY_BASE64 / APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID in Vercel env to push to iOS directly (no FCM-iOS required).'
        : null,
      cronHint:
        jobsByStatus.find((g) => g.status === 'pending')?._count._all
        ? 'There are pending NotifJob rows. If the cron is firing, they should clear within a minute — check Vercel → Settings → Cron Jobs.'
          : null,
    },
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const fcmCreds = loadFcmCredentials()
  const apnsCreds = loadApnsCredentials()

  const body = (await req.json().catch(() => ({}))) as {
    title?: string
    body?: string
  }
  const title = (body.title || 'اختبار حي').slice(0, 60)
  const text = (body.body || 'Test push — if you see this, notifications are wired correctly.').slice(0, 160)

  const tokens = await db.deviceToken.findMany({
    where: { userId: session.userId },
    select: { id: true, token: true, platform: true },
  })
  if (tokens.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'no_device_tokens',
        hint: 'Open the native app with notifications permission granted.',
      },
      { status: 400 },
    )
  }

  // ── Split by platform: iOS → APNs-direct, everything else → FCM ──
  const iosTokens = tokens.filter((t) => t.platform === 'ios')
  const otherTokens = tokens.filter((t) => t.platform !== 'ios')
  const results: Array<{
    tokenId: string
    platform: string
    tokenPrefix: string
    status: number
    ok: boolean
    error?: string
    channel: 'apns' | 'fcm'
  }> = []

  // ── iOS via APNs direct (no Firebase iOS SDK needed) ──
  if (iosTokens.length > 0) {
    if (!apnsCreds) {
      for (const t of iosTokens) {
        results.push({
          tokenId: t.id,
          platform: t.platform,
          tokenPrefix: t.token.slice(0, 18) + '…',
          status: 0,
          ok: false,
          error: 'apns_not_configured — set APNS_KEY_BASE64 / APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID in Vercel env',
          channel: 'apns',
        })
      }
    } else {
      const apnsOut = await sendApnsBatch(
        iosTokens.map((t) => t.token),
        {
          title,
          body: text,
          priority: 'high',
          data: { type: 'debug_test', ts: String(Date.now()) },
        },
        apnsCreds,
      )
      for (const t of iosTokens) {
        const per = apnsOut.perToken.find((p) => p.token === t.token)
        results.push({
          tokenId: t.id,
          platform: t.platform,
          tokenPrefix: t.token.slice(0, 18) + '…',
          status: per?.status ?? 0,
          ok: per?.ok ?? false,
          error: per?.ok ? undefined : per?.reason,
          channel: 'apns',
        })
      }
    }
  }

  // ── Non-iOS via FCM v1 (original path) ──
  if (otherTokens.length > 0) {
    if (!fcmCreds) {
      for (const t of otherTokens) {
        results.push({
          tokenId: t.id,
          platform: t.platform,
          tokenPrefix: t.token.slice(0, 18) + '…',
          status: 0,
          ok: false,
          error: 'fcm_not_configured — set FCM_SERVICE_ACCOUNT_BASE64 in Vercel env',
          channel: 'fcm',
        })
      }
    } else {
      const creds = fcmCreds // narrow for the rest of this block
      // (FCM OAuth mint + send kept inline to preserve the pre-existing flow.)
      const fcmOut = await sendFcmTokens(creds, otherTokens.map((t) => t.token), title, text)
      for (const t of otherTokens) {
        const per = fcmOut.perToken.find((p) => p.token === t.token)
        results.push({
          tokenId: t.id,
          platform: t.platform,
          tokenPrefix: t.token.slice(0, 18) + '…',
          status: per?.status ?? 0,
          ok: per?.ok ?? false,
          error: per?.ok ? undefined : per?.error,
          channel: 'fcm',
        })
      }
    }
  }

  const anyOk = results.some((r) => r.ok)
  return NextResponse.json({
    ok: anyOk,
    totalDevices: tokens.length,
    delivered: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    channels: {
      apns: iosTokens.length,
      fcm: otherTokens.length,
    },
    hint: anyOk
      ? 'At least one device got the push. If the phone still shows nothing, check OS notification permission for the Hai app.'
      : 'No device got it. See the per-token `error` above for the specific reason.',
  })
}

/* Pull the old FCM-inline flow into a tidy helper so the POST body is
   readable. Same behavior as before: mint OAuth token, send to v1 endpoint. */
async function sendFcmTokens(
  creds: NonNullable<ReturnType<typeof loadFcmCredentials>>,
  tokens: string[],
  title: string,
  text: string,
): Promise<{ perToken: Array<{ token: string; ok: boolean; status: number; error?: string }> }> {
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

  const oauthRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!oauthRes.ok) {
    const t = await oauthRes.text().catch(() => '')
    const err = `oauth_failed ${oauthRes.status} ${t.slice(0, 160)}`
    return { perToken: tokens.map((tk) => ({ token: tk, ok: false, status: oauthRes.status, error: err })) }
  }
  const data = (await oauthRes.json()) as { access_token: string }
  const url = `https://fcm.googleapis.com/v1/projects/${creds.projectId}/messages:send`
  const perToken: Array<{ token: string; ok: boolean; status: number; error?: string }> = []

  await Promise.all(tokens.map(async (token) => {
    const payload = {
      message: {
        token,
        notification: { title, body: text },
        data: { type: 'debug_test', ts: String(Date.now()) },
        android: {
          priority: 'HIGH',
          // NO channel_id on the debug payload. The installed Android
          // build might predate the 'hai_default' channel, and posting
          // to a non-existent channel on Android 8+ (targetSdk ≥ 26)
          // causes NotificationManager to silently drop it — user sees
          // "sent" on the card but nothing on the phone. Without a
          // channel_id, FCM routes to the auto-generated fallback
          // channel that every Android install has. Once the rebuild
          // with PushRegistration's channel registration ships, we can
          // add channel_id back.
          notification: { sound: 'default' },
        },
      },
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        perToken.push({ token, ok: true, status: res.status })
      } else {
        const errBody = (await res.json().catch(() => null)) as any
        perToken.push({ token, ok: false, status: res.status, error: errBody?.error?.message || `HTTP ${res.status}` })
      }
    } catch (err: any) {
      perToken.push({ token, ok: false, status: 0, error: err?.message || String(err) })
    }
  }))
  return { perToken }
}


import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import crypto from 'crypto'
import { loadFcmCredentials } from '@/lib/fcm'

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

  const creds = loadFcmCredentials()

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
      configured: !!creds,
      source: creds?.source ?? null,
      projectId: creds?.projectId ?? null,
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
      fcmHint: !creds
        ? 'FCM credentials missing. Set FCM_SERVICE_ACCOUNT_BASE64 (or FCM_PROJECT_ID/_CLIENT_EMAIL/_PRIVATE_KEY) in Vercel env.'
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

  const creds = loadFcmCredentials()
  if (!creds) {
    return NextResponse.json(
      {
        ok: false,
        error: 'fcm_not_configured',
        hint: 'Set FCM_SERVICE_ACCOUNT_BASE64 in Vercel environment variables.',
      },
      { status: 500 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: string
    body?: string
  }
  const title = (body.title || 'اختبار حي').slice(0, 60)
  const text = (body.body || 'Test push — if you see this, FCM is wired correctly.').slice(0, 160)

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

  // Mint an FCM OAuth access token on the fly.
  let accessToken: string
  try {
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
      return NextResponse.json(
        { ok: false, error: 'fcm_oauth_failed', detail: `${oauthRes.status} ${t.slice(0, 200)}` },
        { status: 500 },
      )
    }
    const data = (await oauthRes.json()) as { access_token: string }
    accessToken = data.access_token
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: 'fcm_oauth_exception', detail: err?.message || String(err) },
      { status: 500 },
    )
  }

  const url = `https://fcm.googleapis.com/v1/projects/${creds.projectId}/messages:send`
  const results: Array<{
    tokenId: string
    platform: string
    tokenPrefix: string
    status: number
    ok: boolean
    error?: string
  }> = []

  for (const t of tokens) {
    const payload = {
      message: {
        token: t.token,
        notification: { title, body: text },
        data: { type: 'debug_test', ts: String(Date.now()) },
        android: {
          priority: 'HIGH',
          notification: { sound: 'default' },
        },
        apns: {
          headers: { 'apns-priority': '10' },
          payload: { aps: { sound: 'default' } },
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
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        results.push({
          tokenId: t.id,
          platform: t.platform,
          tokenPrefix: t.token.slice(0, 18) + '…',
          status: res.status,
          ok: true,
        })
      } else {
        const err = await res.json().catch(() => null) as any
        results.push({
          tokenId: t.id,
          platform: t.platform,
          tokenPrefix: t.token.slice(0, 18) + '…',
          status: res.status,
          ok: false,
          error: err?.error?.message || `HTTP ${res.status}`,
        })
      }
    } catch (err: any) {
      results.push({
        tokenId: t.id,
        platform: t.platform,
        tokenPrefix: t.token.slice(0, 18) + '…',
        status: 0,
        ok: false,
        error: err?.message || String(err),
      })
    }
  }

  const anyOk = results.some((r) => r.ok)
  return NextResponse.json({
    ok: anyOk,
    totalDevices: tokens.length,
    delivered: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    hint: anyOk
      ? 'At least one device got the push. If the phone still shows nothing, check OS notification permission for the Hai app.'
      : 'No device got it. Check /api/debug/fcm-check and re-register the device token.',
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import crypto from 'crypto'
import { loadFcmCredentials } from '@/lib/fcm'

export const dynamic = 'force-dynamic'

/**
 * GET /api/debug/fcm-check
 *
 * Diagnostic endpoint that verifies FCM credentials are valid and can
 * mint an OAuth access token. Does NOT leak the credentials themselves
 * — only reports presence, length, and a pass/fail signal.
 *
 * Auth (either works):
 *   1. Admin session cookie (PLATFORM_MOD / SUPER_ADMIN), or
 *   2. Authorization: Bearer <CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  const cronSecret = process.env.CRON_SECRET
  const hasCronBearer = !!cronSecret && auth === `Bearer ${cronSecret}`

  if (!hasCronBearer) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { role: true },
    })
    if (!user || !['PLATFORM_MOD', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  }

  const privateKeyRaw = process.env.FCM_PRIVATE_KEY
  const base64Raw = process.env.FCM_SERVICE_ACCOUNT_BASE64

  // Quick sanity check on the base64 env var
  let base64Preview: string | null = null
  let base64LooksLikeB64 = false
  if (base64Raw) {
    base64Preview = base64Raw.trim().slice(0, 20)
    // Real base64 only uses A-Z a-z 0-9 + / = (no PEM dashes, no spaces)
    base64LooksLikeB64 = /^[A-Za-z0-9+/]+=*$/.test(base64Raw.trim())
  }

  const report: Record<string, any> = {
    envCheck: {
      FCM_SERVICE_ACCOUNT_BASE64: {
        present: !!base64Raw,
        length: base64Raw?.length || 0,
        preview: base64Preview,
        looksLikeBase64: base64LooksLikeB64,
      },
      FCM_PROJECT_ID: {
        present: !!process.env.FCM_PROJECT_ID,
        preview: process.env.FCM_PROJECT_ID || null,
      },
      FCM_CLIENT_EMAIL: {
        present: !!process.env.FCM_CLIENT_EMAIL,
        preview: process.env.FCM_CLIENT_EMAIL
          ? process.env.FCM_CLIENT_EMAIL.replace(/^(.{4}).*(@.*)$/, '$1***$2')
          : null,
      },
      FCM_PRIVATE_KEY: {
        present: !!privateKeyRaw,
        length: privateKeyRaw?.length || 0,
        hasBeginMarker: privateKeyRaw?.includes('BEGIN PRIVATE KEY') ?? false,
        hasEscapedNewlines: privateKeyRaw?.includes('\\n') ?? false,
        hasCR: privateKeyRaw?.includes('\r') ?? false,
      },
    },
    loaderCheck: {
      source: null as string | null,
      ok: false,
      projectId: null as string | null,
      privateKeyStartsWith: null as string | null,
      privateKeyEndsWith: null as string | null,
      privateKeyRealLength: 0,
      privateKeyHasCR: false,
      privateKeyNewlineCount: 0,
    },
    oauthCheck: {
      ok: false,
      error: null as string | null,
      tokenLength: 0,
      expiresInSeconds: 0,
    },
  }

  const creds = loadFcmCredentials()
  if (!creds) {
    report.loaderCheck.ok = false
    report.oauthCheck.error = 'no_valid_credentials'
    return NextResponse.json(report, { status: 200 })
  }

  report.loaderCheck.source = creds.source
  report.loaderCheck.base64Error = creds.base64Error || null
  report.loaderCheck.ok = true
  report.loaderCheck.projectId = creds.projectId
  report.loaderCheck.privateKeyStartsWith = creds.privateKey.slice(0, 30)
  report.loaderCheck.privateKeyEndsWith = creds.privateKey.slice(-30)
  report.loaderCheck.privateKeyRealLength = creds.privateKey.length
  report.loaderCheck.privateKeyHasCR = creds.privateKey.includes('\r')
  report.loaderCheck.privateKeyNewlineCount = (
    creds.privateKey.match(/\n/g) || []
  ).length

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
      report.oauthCheck.error = `http_${res.status}: ${text.slice(0, 200)}`
      return NextResponse.json(report, { status: 200 })
    }
    const data = (await res.json()) as {
      access_token: string
      expires_in: number
    }
    report.oauthCheck.ok = true
    report.oauthCheck.tokenLength = data.access_token?.length || 0
    report.oauthCheck.expiresInSeconds = data.expires_in
  } catch (err: any) {
    report.oauthCheck.error = err?.message || String(err)
  }

  return NextResponse.json(report, { status: 200 })
}

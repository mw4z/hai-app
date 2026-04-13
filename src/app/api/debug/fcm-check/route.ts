import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * GET /api/debug/fcm-check
 *
 * Admin-only diagnostic endpoint that verifies FCM credentials are valid
 * and can mint an OAuth access token. Does NOT leak the credentials
 * themselves — only reports presence, length, and a pass/fail signal.
 *
 * Intended to be hit once after setting FCM_* env vars to confirm the
 * processor cron will be able to send push notifications.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  })
  if (!user || !['PLATFORM_MOD', 'SUPER_ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const projectId = process.env.FCM_PROJECT_ID
  const clientEmail = process.env.FCM_CLIENT_EMAIL
  const privateKeyRaw = process.env.FCM_PRIVATE_KEY

  const report: Record<string, any> = {
    envCheck: {
      FCM_PROJECT_ID: {
        present: !!projectId,
        preview: projectId ? projectId : null,
      },
      FCM_CLIENT_EMAIL: {
        present: !!clientEmail,
        preview: clientEmail ? clientEmail.replace(/^(.{4}).*(@.*)$/, '$1***$2') : null,
      },
      FCM_PRIVATE_KEY: {
        present: !!privateKeyRaw,
        length: privateKeyRaw?.length || 0,
        hasBeginMarker: privateKeyRaw?.includes('BEGIN PRIVATE KEY') ?? false,
        hasEscapedNewlines: privateKeyRaw?.includes('\\n') ?? false,
      },
    },
    oauthCheck: {
      ok: false,
      error: null as string | null,
      tokenLength: 0,
      expiresInSeconds: 0,
    },
  }

  if (!projectId || !clientEmail || !privateKeyRaw) {
    report.oauthCheck.error = 'one_or_more_env_vars_missing'
    return NextResponse.json(report, { status: 200 })
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n')

  try {
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

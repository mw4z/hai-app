import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import crypto from 'crypto'
import { kickNotifCron } from '@/lib/kickNotifCron'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN'] as const
type AdminRole = (typeof ADMIN_ROLES)[number]

const NBHD_RATE_LIMIT_MINUTES = 60
const DEFAULT_EXPIRY_MS = 2 * 60 * 60 * 1000
const CONFIRM_TTL_MS = 5 * 60 * 1000
const VALID_SEVERITY = ['critical', 'warning', 'info'] as const
type Severity = (typeof VALID_SEVERITY)[number]

function confirmSecret(): string {
  const s = process.env.EMERGENCY_CONFIRM_SECRET || process.env.CRON_SECRET
  if (!s) throw new Error('emergency confirm secret not configured')
  return s
}

function buildConfirmPayload(
  userId: string,
  neighborhoodId: string,
  title: string,
  body: string,
  severity: Severity,
): string {
  return [userId, neighborhoodId, title.trim(), body.trim(), severity].join('|')
}

function sign(payload: string, issuedAt: number): string {
  return crypto
    .createHmac('sha256', confirmSecret())
    .update(`${payload}|${issuedAt}`)
    .digest('base64url')
}

function issueConfirmToken(payload: string): { token: string; expiresAt: number } {
  const issuedAt = Date.now()
  return {
    token: `${issuedAt}.${sign(payload, issuedAt)}`,
    expiresAt: issuedAt + CONFIRM_TTL_MS,
  }
}

function verifyConfirmToken(
  token: string,
  payload: string,
): 'valid' | 'expired' | 'invalid' {
  const parts = token.split('.')
  if (parts.length !== 2) return 'invalid'
  const issuedAt = parseInt(parts[0], 10)
  if (!Number.isFinite(issuedAt)) return 'invalid'
  if (Date.now() - issuedAt > CONFIRM_TTL_MS) return 'expired'
  const expected = sign(payload, issuedAt)
  const a = Buffer.from(parts[1])
  const b = Buffer.from(expected)
  if (a.length !== b.length) return 'invalid'
  try {
    return crypto.timingSafeEqual(a, b) ? 'valid' : 'invalid'
  } catch {
    return 'invalid'
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, status: true, neighborhoodId: true },
  })
  if (!user || !ADMIN_ROLES.includes(user.role as AdminRole)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (user.status === 'BANNED_TEMP' || user.status === 'BANNED_PERM') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const title = String(raw.title ?? '').trim()
  const body = String(raw.body ?? '').trim()
  const severity = String(raw.severity ?? '').trim() as Severity
  const confirmToken = raw.confirmToken ? String(raw.confirmToken) : null

  if (!title || title.length > 120) {
    return NextResponse.json({ error: 'invalid_title' }, { status: 400 })
  }
  if (!body || body.length > 500) {
    return NextResponse.json({ error: 'invalid_body_text' }, { status: 400 })
  }
  if (!VALID_SEVERITY.includes(severity)) {
    return NextResponse.json({ error: 'invalid_severity' }, { status: 400 })
  }

  const isPlatform = user.role === 'PLATFORM_MOD' || user.role === 'SUPER_ADMIN'
  const neighborhoodId: string | null = isPlatform
    ? raw.neighborhoodId
      ? String(raw.neighborhoodId)
      : user.neighborhoodId
    : user.neighborhoodId
  if (!neighborhoodId) {
    return NextResponse.json({ error: 'no_neighborhood' }, { status: 400 })
  }
  if (isPlatform && raw.neighborhoodId) {
    const nbhd = await db.neighborhood.findUnique({
      where: { id: neighborhoodId },
      select: { id: true },
    })
    if (!nbhd) return NextResponse.json({ error: 'neighborhood_not_found' }, { status: 404 })
  }

  const payload = buildConfirmPayload(user.id, neighborhoodId, title, body, severity)

  if (!confirmToken) {
    const { token, expiresAt } = issueConfirmToken(payload)
    return NextResponse.json({
      confirmRequired: true,
      confirmToken: token,
      confirmExpiresAt: new Date(expiresAt).toISOString(),
    })
  }

  const verdict = verifyConfirmToken(confirmToken, payload)
  if (verdict === 'expired') {
    return NextResponse.json({ error: 'confirm_expired' }, { status: 400 })
  }
  if (verdict === 'invalid') {
    return NextResponse.json({ error: 'invalid_confirm' }, { status: 400 })
  }

  const windowStart = new Date(Date.now() - NBHD_RATE_LIMIT_MINUTES * 60_000)
  const existing = await db.emergencyAlert.findFirst({
    where: {
      neighborhoodId,
      createdAt: { gte: windowStart },
      revokedAt: null,
    },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json(
      { error: 'rate_limited', reason: 'one_per_hour' },
      { status: 429 },
    )
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + DEFAULT_EXPIRY_MS)

  try {
    const alert = await db.$transaction(async (tx) => {
      const created = await tx.emergencyAlert.create({
        data: {
          neighborhoodId,
          authorId: user.id,
          title,
          body,
          severity,
          createdAt: now,
          expiresAt,
        },
      })
      await tx.notifJob.create({
        data: {
          type: 'emergency_alert',
          priority: 'high',
          targetType: 'nbhd_topic',
          targetRef: neighborhoodId,
          payload: {
            alertId: created.id,
            title: created.title,
            body: created.body,
            severity: created.severity,
          },
        },
      })
      return created
    })
    kickNotifCron()

    console.log('[EMERGENCY_ALERT] created', {
      alertId: alert.id,
      neighborhoodId,
      authorId: user.id,
      severity,
    })

    return NextResponse.json({
      id: alert.id,
      title: alert.title,
      body: alert.body,
      severity: alert.severity,
      expiresAt: alert.expiresAt.toISOString(),
    })
  } catch (err) {
    console.error('[EMERGENCY_ALERT] create failed', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const raw = (await req.json().catch(() => null)) as
    | {
        token?: string
        platform?: string
        deviceId?: string
        appVersion?: string
      }
    | null
  if (!raw?.token || typeof raw.token !== 'string') {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }
  const token = raw.token.trim()
  if (token.length < 20 || token.length > 4096) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }
  const platformRaw = String(raw.platform || '').toLowerCase()
  const platform =
    platformRaw === 'ios' || platformRaw === 'android' || platformRaw === 'web'
      ? platformRaw
      : 'android'

  try {
    // Refuse to re-alias a token that already belongs to a different
    // user (audit H-1). Without this guard, an attacker who somehow
    // obtained a victim's APNs/FCM token could re-register it under
    // their own session and start receiving the victim's pushes —
    // including DM notifications and OTP codes if any are pushed.
    const existing = await db.deviceToken.findUnique({
      where: { token },
      select: { userId: true },
    })
    if (existing && existing.userId !== session.userId) {
      // Don't reveal whether the token exists; treat as a bad request.
      return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
    }

    const saved = await db.deviceToken.upsert({
      where: { token },
      create: {
        token,
        userId: session.userId,
        platform,
        deviceId: raw.deviceId || null,
        appVersion: raw.appVersion || null,
      },
      update: {
        // userId intentionally not overwritten — the existence check
        // above already proved this token is owned by session.userId.
        platform,
        deviceId: raw.deviceId || null,
        appVersion: raw.appVersion || null,
        lastSeenAt: new Date(),
      },
      select: { id: true },
    })
    return NextResponse.json({ ok: true, id: saved.id })
  } catch (err) {
    console.error('[DEVICE_REGISTER] failed', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const all = url.searchParams.get('all') === 'true'

  if (!token && !all) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 400 })
  }

  try {
    const result = await db.deviceToken.deleteMany({
      where: all
        ? { userId: session.userId }
        : { token: token!, userId: session.userId },
    })
    return NextResponse.json({ ok: true, deleted: result.count })
  } catch (err) {
    console.error('[DEVICE_REGISTER] delete failed', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

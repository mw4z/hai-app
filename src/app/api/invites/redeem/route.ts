import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { hashIp } from '@/lib/invites'

export const dynamic = 'force-dynamic'

const NEW_USER_WINDOW_MS = 24 * 60 * 60_000 // 24h after signup

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const raw = (await req.json().catch(() => null)) as
    | { code?: string; deviceId?: string }
    | null
  if (!raw) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const codeInput = String(raw.code || '').trim().toUpperCase()
  const deviceId = raw.deviceId ? String(raw.deviceId).trim() : null
  if (!codeInput) return NextResponse.json({ error: 'code_required' }, { status: 400 })

  const invitee = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      createdAt: true,
      invitedById: true,
      status: true,
      signupDeviceId: true,
      signupIpHash: true,
    },
  })
  if (!invitee) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (invitee.status === 'BANNED_TEMP' || invitee.status === 'BANNED_PERM') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  if (Date.now() - invitee.createdAt.getTime() > NEW_USER_WINDOW_MS) {
    return NextResponse.json({ error: 'too_late' }, { status: 409 })
  }
  if (invitee.invitedById) {
    return NextResponse.json({ error: 'already_redeemed' }, { status: 409 })
  }
  const alreadyRow = await db.inviteRedemption.findUnique({
    where: { inviteeId: session.userId },
    select: { id: true },
  })
  if (alreadyRow) {
    return NextResponse.json({ error: 'already_redeemed' }, { status: 409 })
  }

  const codeRow = await db.inviteCode.findUnique({
    where: { code: codeInput },
    select: {
      code: true,
      userId: true,
      user: {
        select: {
          id: true,
          name: true,
          lastName: true,
          status: true,
          signupDeviceId: true,
        },
      },
    },
  })
  if (!codeRow) return NextResponse.json({ error: 'code_not_found' }, { status: 404 })
  if (codeRow.userId === session.userId) {
    return NextResponse.json({ error: 'self_invite' }, { status: 409 })
  }
  if (
    codeRow.user.status === 'BANNED_TEMP' ||
    codeRow.user.status === 'BANNED_PERM'
  ) {
    return NextResponse.json({ error: 'inviter_unavailable' }, { status: 409 })
  }

  if (
    deviceId &&
    codeRow.user.signupDeviceId &&
    codeRow.user.signupDeviceId === deviceId
  ) {
    await db.inviteFraudSignal.create({
      data: {
        userId: session.userId,
        kind: 'shared_device',
        detail: { at: 'redeem', inviterId: codeRow.userId, deviceId },
      },
    })
    return NextResponse.json({ error: 'same_device' }, { status: 409 })
  }

  const ipHash = hashIp(req)

  try {
    await db.$transaction(async (tx) => {
      await tx.inviteRedemption.create({
        data: {
          inviterId: codeRow.userId,
          inviteeId: session.userId,
          code: codeRow.code,
          status: 'PENDING',
          signupDeviceId: deviceId,
          signupIpHash: ipHash,
        },
      })
      await tx.user.update({
        where: { id: session.userId },
        data: {
          invitedById: codeRow.userId,
          signupDeviceId: invitee.signupDeviceId ?? deviceId ?? undefined,
          signupIpHash: invitee.signupIpHash ?? ipHash ?? undefined,
        },
      })
      await tx.inviteCode.update({
        where: { code: codeRow.code },
        data: { uses: { increment: 1 } },
      })
    })
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'already_redeemed' }, { status: 409 })
    }
    console.error('[INVITE_REDEEM] failed', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    status: 'PENDING',
    inviterName: [codeRow.user.name?.trim(), codeRow.user.lastName?.trim()].filter(Boolean).join(' ') || codeRow.user.name,
  })
}

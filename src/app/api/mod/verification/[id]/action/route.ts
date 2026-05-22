import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canVerifyProviders } from '@/lib/modPermissions'
import { logModAction } from '@/lib/modAudit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/mod/verification/[id]/action  { action: 'approve'|'reject', reason? }
 * PLATFORM_MOD + SUPER_ADMIN only. Approve grants the platform-wide
 * VERIFIED_PROVIDER badge; reject closes the request with a reason. Every
 * action is written to ModActionLog with old + new status.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const me = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!me || !canVerifyProviders(me.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const action = body?.action
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'إجراء غير صالح' }, { status: 400 })
  }

  const vr = await db.verificationRequest.findUnique({ where: { id: params.id } })
  if (!vr || vr.status !== 'pending') return NextResponse.json({ error: 'غير موجود' }, { status: 404 })

  const oldStatus = vr.status
  const newStatus = action === 'approve' ? 'approved' : 'rejected'

  if (action === 'approve') {
    await db.user.update({
      where: { id: vr.userId },
      data: { accountType: 'VERIFIED_PROVIDER', providerStatus: 'VERIFIED', providerStatusChangedAt: new Date() },
    })
  }
  await db.verificationRequest.update({
    where: { id: vr.id },
    data: { status: newStatus, reviewedBy: session.userId, reviewedAt: new Date() },
  })

  await logModAction({
    moderatorId: session.userId,
    actionType: action === 'approve' ? 'verification_approve' : 'verification_reject',
    targetType: 'verification_request',
    targetId: vr.id,
    details: JSON.stringify({ targetUserId: vr.userId, reason: reason || null, oldStatus, newStatus }),
  })

  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { POLL_REQUEST_LIMITS } from '@/lib/pollRequest'
import { kickNotifCron } from '@/lib/kickNotifCron'
import { log } from '@/lib/logger'

const MOD_ROLES = new Set(['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN'])

/**
 * POST /api/mod/poll-requests/[id]/reject — mod rejects a pending
 * suggestion. The rejection reason is required so the requester gets
 * actionable feedback and the mod's decision is auditable. No Poll is
 * created.
 *
 * Body: { rejectionReason: string }   (max 300 chars after trim)
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', `/api/mod/poll-requests/${params.id}/reject`, session.userId)

    const me = await db.user.findUnique({
      where: { id: session.userId },
      select: { id: true, role: true, neighborhoodId: true },
    })
    if (!me || !MOD_ROLES.has(me.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const pr = await db.pollRequest.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, title: true, neighborhoodId: true, userId: true },
    })
    if (!pr) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isPlatform = me.role === 'PLATFORM_MOD' || me.role === 'SUPER_ADMIN'
    if (!isPlatform && pr.neighborhoodId !== me.neighborhoodId) {
      return NextResponse.json({ error: 'Out of scope' }, { status: 403 })
    }
    if (pr.status !== 'PENDING') {
      return NextResponse.json({ error: 'Already reviewed' }, { status: 409 })
    }

    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const reason = typeof body?.rejectionReason === 'string' ? body.rejectionReason.trim() : ''
    if (reason.length === 0) {
      return NextResponse.json({ error: 'rejection_reason_required' }, { status: 400 })
    }
    if (reason.length > POLL_REQUEST_LIMITS.reason.max) {
      return NextResponse.json({ error: 'rejection_reason_too_long' }, { status: 400 })
    }

    const updated = await db.pollRequest.update({
      where: { id: pr.id },
      data: {
        status: 'REJECTED',
        reviewedById: me.id,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
      select: { id: true, status: true },
    })

    // Notify the requester — bell row + push job. SYSTEM type, same
    // pattern as the approve path.
    await db.notification.create({
      data: {
        userId: pr.userId,
        type: 'SYSTEM',
        actorId: me.id,
        title: '❌ لم يتم قبول اقتراح الاستفتاء',
        titleEn: '❌ Your poll suggestion was not approved',
        body: reason.slice(0, 200),
        bodyEn: reason.slice(0, 200),
      },
    }).catch(() => { /* notification best-effort */ })

    await db.notifJob.create({
      data: {
        type: 'poll_request_rejected',
        priority: 'normal',
        targetType: 'user',
        targetRef: pr.userId,
        payload: {
          requestId: pr.id,
          title: pr.title,
          reason,
        },
      },
    }).catch(() => { /* push best-effort */ })
    kickNotifCron()

    return NextResponse.json({ requestId: updated.id, status: updated.status })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/mod/poll-requests/[id]/reject' })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

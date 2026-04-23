import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { kickNotifCron } from '@/lib/kickNotifCron'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']
const DEFAULT_EXPIRY_MS = 2 * 60 * 60 * 1000 // 2 hours
const NBHD_RATE_LIMIT_MINUTES = 60

/**
 * POST /api/admin/emergency-requests/[id]/approve
 *
 * Mod approves a pending user-submitted request. Creates a real
 * EmergencyAlert and enqueues a push job — same contract as the
 * direct /api/emergency/create flow, minus the two-step confirm
 * (the mod has already reviewed the full payload in the queue UI).
 *
 * Atomicity: alert creation + request update + NotifJob enqueue are
 * wrapped in a single transaction. If anything fails, nothing is
 * persisted and the request stays PENDING for retry.
 *
 * Still enforces the 1/hr per-neighborhood rate limit.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, status: true, neighborhoodId: true },
  })
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (user.status === 'BANNED_TEMP' || user.status === 'BANNED_PERM') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const request = await db.emergencyAlertRequest.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      neighborhoodId: true,
      requesterId: true,
      title: true,
      body: true,
      severity: true,
      status: true,
      expiresAt: true,
    },
  })
  if (!request) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (request.status !== 'PENDING') {
    return NextResponse.json(
      { error: 'already_reviewed', status: request.status },
      { status: 409 },
    )
  }
  if (request.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'expired' }, { status: 409 })
  }

  // NEIGHBORHOOD_MOD may only approve within their own neighborhood
  if (
    user.role === 'NEIGHBORHOOD_MOD' &&
    request.neighborhoodId !== user.neighborhoodId
  ) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Rate limit: 1 active alert per neighborhood per hour
  const windowStart = new Date(Date.now() - NBHD_RATE_LIMIT_MINUTES * 60_000)
  const existingAlert = await db.emergencyAlert.findFirst({
    where: {
      neighborhoodId: request.neighborhoodId,
      createdAt: { gte: windowStart },
      revokedAt: null,
    },
    select: { id: true },
  })
  if (existingAlert) {
    return NextResponse.json(
      { error: 'rate_limited', reason: 'one_per_hour' },
      { status: 429 },
    )
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + DEFAULT_EXPIRY_MS)

  try {
    const alert = await db.$transaction(async (tx) => {
      // Optimistic concurrency: atomically flip status only if still PENDING.
      // If two mods race, one succeeds and the other gets rowcount=0.
      const claim = await tx.emergencyAlertRequest.updateMany({
        where: {
          id: request.id,
          status: 'PENDING',
          expiresAt: { gt: now },
        },
        data: {
          status: 'APPROVED',
          reviewedById: user.id,
          reviewedAt: now,
        },
      })
      if (claim.count === 0) {
        throw new Error('race_lost')
      }

      const created = await tx.emergencyAlert.create({
        data: {
          neighborhoodId: request.neighborhoodId,
          // Author = the approving mod. The request.requesterId is still
          // tracked via EmergencyAlertRequest for the full audit trail.
          authorId: user.id,
          title: request.title,
          body: request.body,
          severity: request.severity,
          createdAt: now,
          expiresAt,
        },
      })
      // Link the request to the created alert now that we have its id
      await tx.emergencyAlertRequest.update({
        where: { id: request.id },
        data: { approvedAlertId: created.id },
      })
      await tx.notifJob.create({
        data: {
          type: 'emergency_alert',
          priority: 'high',
          targetType: 'nbhd_topic',
          targetRef: request.neighborhoodId,
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

    console.log('[EMERGENCY_REQUEST] approved', {
      requestId: request.id,
      alertId: alert.id,
      approvedBy: user.id,
      requesterId: request.requesterId,
    })

    return NextResponse.json({
      ok: true,
      alert: {
        id: alert.id,
        title: alert.title,
        body: alert.body,
        severity: alert.severity,
        expiresAt: alert.expiresAt.toISOString(),
      },
    })
  } catch (err: any) {
    if (err?.message === 'race_lost') {
      console.log('[EMERGENCY_REQUEST] approve race lost', { requestId: request.id })
      return NextResponse.json(
        { error: 'already_reviewed', message: 'Another mod just reviewed this request' },
        { status: 409 },
      )
    }
    console.error('[EMERGENCY_REQUEST] approve failed', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

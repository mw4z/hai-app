import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import {
  validatePollRequest,
  pollRequestLimitFor,
} from '@/lib/pollRequest'
import { kickNotifCron } from '@/lib/kickNotifCron'
import { log } from '@/lib/logger'

/**
 * POST /api/poll-requests — resident submits a poll suggestion. The
 * request lands as PENDING; a neighborhood mod must approve before a
 * real Poll is created. Direct Poll creation stays admin-only.
 *
 * Rate limit:
 *   • default: 1 / 7 days
 *   • reputation ≥ 150: 2 / 7 days
 * All statuses count (PENDING + APPROVED + REJECTED) so a rejected
 * request doesn't free up a slot for a retry.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', '/api/poll-requests', session.userId)

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true, name: true, neighborhoodId: true, reputation: true,
        status: true, deletedAt: true,
      },
    })
    if (!user || user.deletedAt) {
      return NextResponse.json({ error: 'Account unavailable' }, { status: 404 })
    }
    if (user.status === 'BANNED_TEMP' || user.status === 'BANNED_PERM') {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 })
    }
    if (!user.neighborhoodId || !user.name?.trim()) {
      return NextResponse.json({ error: 'Complete your profile first' }, { status: 400 })
    }

    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const result = validatePollRequest(body as any)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const policy = pollRequestLimitFor(user.reputation ?? 0)
    const windowStart = new Date(Date.now() - policy.windowMs)
    const recent = await db.pollRequest.count({
      where: { userId: user.id, createdAt: { gte: windowStart } },
    })
    if (recent >= policy.max) {
      return NextResponse.json(
        { error: 'rate_limited', limit: policy.max, windowDays: 7 },
        { status: 429 },
      )
    }

    const pr = await db.pollRequest.create({
      data: {
        userId: user.id,
        neighborhoodId: user.neighborhoodId,
        title: result.value.title,
        description: result.value.description,
        options: result.value.options,
        reason: result.value.reason,
      },
      select: { id: true, status: true, createdAt: true },
    })

    // Notify the neighborhood mods + platform-admin pool. SYSTEM type
    // matches the existing emergency / neighborhood-report fanout — no
    // new NotificationType enum value.
    const admins = await db.user.findMany({
      where: {
        OR: [
          { neighborhoodId: user.neighborhoodId, role: 'NEIGHBORHOOD_MOD' },
          { role: 'PLATFORM_MOD' },
          { role: 'SUPER_ADMIN' },
        ],
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
    })
    if (admins.length > 0) {
      const requesterName = (user.name || '').trim() || 'جار'
      await db.notification.createMany({
        data: admins.map(a => ({
          userId: a.id,
          type: 'SYSTEM' as const,
          actorId: user.id,
          actorName: requesterName,
          title: '🗳️ اقتراح استفتاء جديد',
          titleEn: '🗳️ New poll suggestion',
          body: result.value.title.slice(0, 120),
          bodyEn: result.value.title.slice(0, 120),
        })),
      })
      // Enqueue push fan-out and kick the cron — without this step, the
      // bell row exists but no banner reaches the mod's phone (the
      // symptom that surfaced this gap). Mirrors the emergency-request
      // pattern in /api/emergency/request.
      await db.notifJob.createMany({
        data: admins.map(a => ({
          type: 'poll_request_submitted',
          priority: 'normal',
          targetType: 'user',
          targetRef: a.id,
          payload: {
            requestId: pr.id,
            title: result.value.title,
            requesterName,
            requesterId: user.id,
            neighborhoodId: user.neighborhoodId,
          },
        })),
      })
      kickNotifCron()
    }

    return NextResponse.json({ id: pr.id, status: pr.status }, { status: 201 })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/poll-requests POST' })
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

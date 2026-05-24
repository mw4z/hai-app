import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { requireUserReady } from '@/lib/requireUserReady'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { kickNotifCron } from '@/lib/kickNotifCron'
import { canCreateEmergencyAlert } from '@/lib/membership'

export const dynamic = 'force-dynamic'

/**
 * Request TTL is intentionally separate from (and longer than) the
 * broadcast TTL (2h). If a resident reports something just before the
 * mod team sleeps, a short window would auto-expire the request before
 * anyone sees it. 8h covers a full working shift.
 */
const REQUEST_TTL_HOURS = 8
const MAX_PER_24H = 3
const VALID_SEVERITY = ['critical', 'warning', 'info'] as const
type Severity = (typeof VALID_SEVERITY)[number]

/**
 * POST /api/emergency/request
 *
 * Regular users submit an emergency alert request that goes into a
 * moderator queue. No public feed visibility. Approval creates the
 * real EmergencyAlert and enqueues the push. Rejection is terminal.
 *
 * Rate limits:
 *   - 1 PENDING request per user at a time
 *   - 3 total requests per user per rolling 24h
 *   - Pending requests auto-expire after REQUEST_TTL_HOURS
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const ready = await requireUserReady(session.userId)
  if (!ready.ok) return ready.response

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, lastName: true, status: true, neighborhoodId: true, role: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const bypass = isSuperAdminRole(user.role)
  if (!bypass && (user.status === 'BANNED_TEMP' || user.status === 'BANNED_PERM')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (!user.neighborhoodId) {
    return NextResponse.json({ error: 'no_neighborhood' }, { status: 400 })
  }
  // Emergency alerts are VERIFIED_RESIDENT only — a claimed (unverified)
  // resident can't trigger a neighborhood-wide alert.
  if (!bypass && !canCreateEmergencyAlert(ready.user.membership)) {
    return NextResponse.json(
      { error: 'membership_required', message: 'هذه الميزة تتطلب تأكيد السكن داخل الحي.' },
      { status: 403 },
    )
  }

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const title = String(raw.title ?? '').trim()
  const body = String(raw.body ?? '').trim()
  const severity = String(raw.severity ?? '').trim() as Severity

  if (!title || title.length > 120) {
    return NextResponse.json({ error: 'invalid_title' }, { status: 400 })
  }
  if (!body || body.length > 500) {
    return NextResponse.json({ error: 'invalid_body_text' }, { status: 400 })
  }
  if (!VALID_SEVERITY.includes(severity)) {
    return NextResponse.json({ error: 'invalid_severity' }, { status: 400 })
  }

  if (!bypass) {
    // Rate limit: 1 active PENDING request per user at a time
    const activePending = await db.emergencyAlertRequest.findFirst({
      where: {
        requesterId: user.id,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    })
    if (activePending) {
      return NextResponse.json(
        { error: 'pending_exists', message: 'You already have a pending emergency request' },
        { status: 409 },
      )
    }

    // Rate limit: max 3 requests per rolling 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recent = await db.emergencyAlertRequest.count({
      where: {
        requesterId: user.id,
        createdAt: { gte: since },
      },
    })
    if (recent >= MAX_PER_24H) {
      return NextResponse.json(
        { error: 'rate_limited', message: 'Too many requests in the last 24 hours' },
        { status: 429 },
      )
    }
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + REQUEST_TTL_HOURS * 60 * 60 * 1000)

  try {
    const request = await db.emergencyAlertRequest.create({
      data: {
        neighborhoodId: user.neighborhoodId,
        requesterId: user.id,
        title,
        body,
        severity,
        status: 'PENDING',
        createdAt: now,
        expiresAt,
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        expiresAt: true,
      },
    })
    console.log('[EMERGENCY_REQUEST] created', {
      id: request.id,
      userId: user.id,
      neighborhoodId: user.neighborhoodId,
      severity,
    })

    // ── Notify the mod team ──────────────────────────────────────
    // Strictly the requester's own NEIGHBORHOOD_MOD(s) + every
    // SUPER_ADMIN. Mods for other neighborhoods never receive a
    // notification about another neighborhood's emergency request.
    ;(async () => {
      try {
        const [superAdmins, nbhdMods] = await Promise.all([
          db.user.findMany({
            where: { status: 'ACTIVE', role: 'SUPER_ADMIN' },
            select: { id: true },
          }),
          db.user.findMany({
            where: {
              status: 'ACTIVE',
              role: 'NEIGHBORHOOD_MOD',
              neighborhoodId: user.neighborhoodId!,
            },
            select: { id: true },
          }),
        ])
        const seen = new Set<string>()
        const admins = [...superAdmins, ...nbhdMods].filter((a) => {
          if (seen.has(a.id)) return false
          seen.add(a.id)
          return true
        })
        if (admins.length === 0) return

        const severityEmoji = severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️'
        const requesterName = [user.name?.trim(), user.lastName?.trim()].filter(Boolean).join(' ') || user.name || 'جار'
        const bellTitle = `${severityEmoji} طلب تنبيه طوارئ — ${requesterName}`
        const bellTitleEn = `${severityEmoji} Emergency request — ${requesterName}`
        const bodySnippet = title.slice(0, 140)

        await db.notification.createMany({
          data: admins.map((a) => ({
            type: 'SYSTEM' as const,
            userId: a.id,
            actorId: user.id,
            actorName: requesterName,
            title: bellTitle,
            titleEn: bellTitleEn,
            body: bodySnippet,
            bodyEn: bodySnippet,
          })),
        })
        await db.notifJob.createMany({
          data: admins.map((a) => ({
            type: 'emergency_alert_request',
            // critical → high priority so mods get an immediate banner
            priority: severity === 'critical' ? 'high' : 'normal',
            targetType: 'user',
            targetRef: a.id,
            payload: {
              requestId: request.id,
              severity,
              requesterId: user.id,
              requesterName,
              neighborhoodId: user.neighborhoodId,
              title,
            },
          })),
        })
        console.log('[EMERGENCY_REQUEST] fan-out computed', {
          requestId: request.id,
          requesterId: user.id,
          requesterNeighborhoodId: user.neighborhoodId,
          superAdminCount: superAdmins.length,
          nbhdModCount: nbhdMods.length,
          totalRecipients: admins.length,
        })
        kickNotifCron()
      } catch (err) {
        console.error('[EMERGENCY_REQUEST] admin notify failed', err)
      }
    })()

    return NextResponse.json(request)
  } catch (err) {
    console.error('[EMERGENCY_REQUEST] create failed', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

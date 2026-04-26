import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { log } from '@/lib/logger'
import { getModCapacity } from '@/lib/mod-allocation'
import { kickNotifCron } from '@/lib/kickNotifCron'

/** POST — submit a request to become neighborhood mod */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', '/api/mod-request', session.userId)

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { role: true, neighborhoodId: true, reputation: true, createdAt: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    if (user.role !== 'RESIDENT') {
      return NextResponse.json({ error: 'لديك صلاحيات بالفعل' }, { status: 400 })
    }

    if (!user.neighborhoodId) {
      return NextResponse.json({ error: 'يجب أن تكون مسجلاً في حي' }, { status: 400 })
    }

    const ageDays = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000)
    if (ageDays < 7) {
      return NextResponse.json({ error: 'حسابك يجب أن يكون عمره 7 أيام على الأقل' }, { status: 400 })
    }

    if (user.reputation < 20) {
      return NextResponse.json({ error: 'تحتاج 20 نقطة سمعة على الأقل' }, { status: 400 })
    }

    const existing = await db.modRequest.findFirst({
      where: { userId: session.userId, status: 'pending' },
    })
    if (existing) {
      return NextResponse.json({ error: 'لديك طلب قيد المراجعة بالفعل' }, { status: 409 })
    }

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
    const { reason } = body
    if (!reason || reason.trim().length < 10) {
      return NextResponse.json({ error: 'اكتب سبب طلبك (10 أحرف على الأقل)' }, { status: 400 })
    }

    // ── Check neighborhood mod capacity ───────────────────────────────────────
    const capacity = await getModCapacity(user.neighborhoodId)

    // Block application if at max capacity
    if (!capacity.acceptingApps) {
      return NextResponse.json({
        error: 'حيّك لديه عدد كافٍ من المشرفين حالياً / This neighborhood currently has enough moderators',
        capacity: { active: capacity.activeMods, max: capacity.maxMods, level: capacity.level },
      }, { status: 400 })
    }

    // ── Auto-approval: ZERO mods + strong user ───────────────────────────────
    const autoApprove = capacity.totalMods === 0 && user.reputation >= 50 && ageDays >= 14

    if (autoApprove) {
      const request = await db.modRequest.create({
        data: {
          userId: session.userId,
          neighborhoodId: user.neighborhoodId,
          reason: reason.trim(),
          status: 'approved',
          reviewedBy: 'SYSTEM_AUTO',
          reviewedAt: new Date(),
        },
      })

      await db.user.update({
        where: { id: session.userId },
        data: { role: 'NEIGHBORHOOD_MOD', modApprovedAt: new Date() },
      })

      await db.notification.create({
        data: {
          userId: session.userId,
          actorId: session.userId,
          type: 'SYSTEM',
          title: 'تم تعيينك مشرف الحي!',
          titleEn: 'You are now a Neighborhood Mod!',
          body: 'حيّك كان بدون مشرف — تم قبولك تلقائياً. شكراً لمبادرتك!',
          bodyEn: 'Your neighborhood had no mod — you were auto-approved. Thanks for stepping up!',
        },
      })

      log.info('Auto-approved mod request', {
        route: '/api/mod-request',
        userId: session.userId,
        neighborhoodId: user.neighborhoodId,
        capacity: capacity.level,
      })

      return NextResponse.json({ id: request.id, autoApproved: true })
    }

    // Standard flow: create pending request
    const request = await db.modRequest.create({
      data: {
        userId: session.userId,
        neighborhoodId: user.neighborhoodId,
        reason: reason.trim(),
      },
    })

    // Notify platform admins so no request sits untriaged. Scoped to
    // SUPER_ADMIN + PLATFORM_MOD (they're the only roles allowed to
    // approve/reject). Bell row + push job — same pattern as
    // user-report fan-out. NEIGHBORHOOD_MODs don't review these
    // (can't peer-review applicants to their own seat), so they're
    // intentionally not on this fan-out.
    try {
      const requesterRow = await db.user.findUnique({
        where: { id: session.userId },
        select: { name: true, lastName: true },
      })
      const requesterName = [requesterRow?.name?.trim(), requesterRow?.lastName?.trim()].filter(Boolean).join(' ') || requesterRow?.name || null

      const platformAdmins = await db.user.findMany({
        where: {
          status: 'ACTIVE',
          role: { in: ['SUPER_ADMIN', 'PLATFORM_MOD'] },
        },
        select: { id: true },
      })

      if (platformAdmins.length > 0) {
        const bellTitle = `طلب مشرف جديد${requesterName ? ` — ${requesterName}` : ''}`
        const bellTitleEn = `New moderator request${requesterName ? ` — ${requesterName}` : ''}`
        const bodySnippet = reason.trim().slice(0, 140)

        await db.notification.createMany({
          data: platformAdmins.map((a) => ({
            type: 'SYSTEM' as const,
            userId: a.id,
            actorId: session.userId,
            actorName: requesterName || 'النظام',
            title: bellTitle,
            titleEn: bellTitleEn,
            body: bodySnippet,
            bodyEn: bodySnippet,
          })),
        })

        await db.notifJob.createMany({
          data: platformAdmins.map((a) => ({
            type: 'mod_request_submitted',
            priority: 'normal',
            targetType: 'user',
            targetRef: a.id,
            payload: {
              requestId: request.id,
              requesterId: session.userId,
              requesterName,
              neighborhoodId: user.neighborhoodId,
              snippet: bodySnippet,
            },
          })),
        })
        kickNotifCron()
      }
    } catch (err) {
      console.error('[MOD_REQUEST] admin notify failed:', err)
    }

    return NextResponse.json({ id: request.id, capacity: { active: capacity.activeMods, max: capacity.maxMods, level: capacity.level } })
  } catch (error) {
    log.error('Mod request failed', error, { route: '/api/mod-request' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

/** GET — check current user's mod request status + neighborhood capacity */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { neighborhoodId: true },
    })

    const request = await db.modRequest.findFirst({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, createdAt: true },
    })

    // Include capacity info so the UI can show "1/3 moderators active"
    let capacity = null
    if (user?.neighborhoodId) {
      capacity = await getModCapacity(user.neighborhoodId)
    }

    return NextResponse.json({ request, capacity })
  } catch (error) {
    log.error('Mod request check failed', error, { route: '/api/mod-request GET' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

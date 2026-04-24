import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/admin/mods/[id]
 *
 * Admin-only lifecycle actions on a neighborhood moderator.
 *
 * Body:
 *   action  'suspend' | 'reinstate' | 'demote' | 'warn' | 'clear_review'
 *   reason  required for suspend/demote/warn (min 5 chars)
 *
 * Auth:
 *   - PLATFORM_MOD + SUPER_ADMIN: any mod
 *   - NEIGHBORHOOD_MOD: NOT allowed to act on other mods (would be a
 *     peer-on-peer powergrab; escalate via the report system instead)
 *
 * Every action writes ModerationLog + (when demoting/suspending)
 * notifies the affected mod. Role is only changed by 'demote' —
 * 'suspend' preserves the NEIGHBORHOOD_MOD role so the mod can be
 * reinstated without re-applying, while 'demote' permanently returns
 * them to RESIDENT (they must re-apply to moderate again).
 */
const ACTIONS = ['suspend', 'reinstate', 'demote', 'warn', 'clear_review'] as const
type Action = typeof ACTIONS[number]

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, name: true, neighborhoodId: true, status: true },
  })
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (admin.role !== 'PLATFORM_MOD' && admin.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (admin.status === 'BANNED_TEMP' || admin.status === 'BANNED_PERM') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const action = String(body?.action ?? '').trim() as Action
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 })
  }
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  if (['suspend', 'demote', 'warn'].includes(action) && reason.length < 5) {
    return NextResponse.json({ error: 'reason_required' }, { status: 400 })
  }

  const target = await db.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, role: true, modStatus: true, neighborhoodId: true },
  })
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (target.role !== 'NEIGHBORHOOD_MOD' && action !== 'clear_review') {
    return NextResponse.json({ error: 'not_a_mod' }, { status: 400 })
  }

  let dataUpdate: Record<string, unknown> = {}
  let notifTitle = ''
  let notifTitleEn = ''
  let notifBody = ''
  let notifBodyEn = ''

  switch (action) {
    case 'suspend':
      dataUpdate = { modStatus: 'SUSPENDED' }
      notifTitle = 'تم تعليق صلاحيات الإشراف'
      notifTitleEn = 'Your moderator powers are suspended'
      notifBody = reason
      notifBodyEn = reason
      break
    case 'reinstate':
      // Only meaningful from SUSPENDED → ACTIVE. Also clears review
      // flags the admin may have set.
      dataUpdate = { modStatus: 'ACTIVE', modReportCount: 0 }
      notifTitle = 'تم استعادة صلاحيات الإشراف'
      notifTitleEn = 'Your moderator powers are reinstated'
      notifBody = 'تم استعادة صلاحياتك كمشرف حي.'
      notifBodyEn = 'Your neighborhood-moderator powers have been reinstated.'
      break
    case 'demote':
      // Full demotion: back to RESIDENT + reset counters so if they
      // re-apply later the new lifecycle starts clean.
      dataUpdate = {
        role: 'RESIDENT',
        modStatus: 'ACTIVE',
        modApprovedAt: null,
        modActionsCount: 0,
        modReportCount: 0,
        lastModActionAt: null,
      }
      notifTitle = 'تم إنهاء دورك كمشرف'
      notifTitleEn = 'You are no longer a moderator'
      notifBody = reason
      notifBodyEn = reason
      break
    case 'warn':
      // Leaves status untouched; delivers a notice only.
      notifTitle = 'تحذير من الأدمن'
      notifTitleEn = 'Warning from admin'
      notifBody = reason
      notifBodyEn = reason
      break
    case 'clear_review':
      // Exit UNDER_REVIEW back to ACTIVE + reset the report counter.
      // Use after the admin has triaged the pending reports.
      if (target.modStatus !== 'UNDER_REVIEW') {
        return NextResponse.json({ error: 'not_under_review' }, { status: 400 })
      }
      dataUpdate = { modStatus: 'ACTIVE', modReportCount: 0 }
      notifTitle = 'تم إنهاء مراجعة حسابك'
      notifTitleEn = 'Mod review cleared'
      notifBody = 'تمت مراجعة حسابك وإعادته إلى حالة نشط.'
      notifBodyEn = 'Your mod account has been reviewed and restored to ACTIVE.'
      break
  }

  try {
    if (Object.keys(dataUpdate).length > 0) {
      await db.user.update({ where: { id: target.id }, data: dataUpdate })
    }

    await db.moderationLog.create({
      data: {
        adminId: admin.id,
        adminName: admin.name,
        action: `mod_${action}`,
        targetType: 'user',
        targetId: target.id,
        reason: reason || null,
        details: `modStatus=${String(dataUpdate.modStatus ?? target.modStatus)} role=${String(dataUpdate.role ?? target.role)}`,
      },
    }).catch(() => {})

    // Tell the affected mod what happened. Best-effort — bell only,
    // no phone push, since this is a governance event not an urgent
    // interaction.
    db.notification.create({
      data: {
        type: 'SYSTEM',
        userId: target.id,
        actorId: admin.id,
        actorName: admin.name || 'Admin',
        title: notifTitle,
        titleEn: notifTitleEn,
        body: notifBody,
        bodyEn: notifBodyEn,
      },
    }).catch(() => {})

    console.log('[MOD_LIFECYCLE] admin action', {
      action,
      adminId: admin.id,
      targetId: target.id,
    })

    return NextResponse.json({ ok: true, action })
  } catch (err) {
    console.error('[MOD_LIFECYCLE] action failed', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

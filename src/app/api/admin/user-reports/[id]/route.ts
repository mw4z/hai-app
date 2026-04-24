import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { ReportStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']
const ALLOWED_STATUSES: ReportStatus[] = [
  'REVIEWED',
  'DISMISSED',
  'ACTION_TAKEN',
]

/**
 * PATCH /api/admin/user-reports/[id]
 *
 * Mark a UserReport as reviewed / dismissed / action-taken. Scoped so
 * a neighborhood mod can only resolve reports filed against users in
 * their own neighborhood; platform-level admins can resolve any.
 *
 * Body:
 *   status  required, one of REVIEWED | DISMISSED | ACTION_TAKEN
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const admin = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true, name: true, status: true },
  })
  if (!admin || !ADMIN_ROLES.includes(admin.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (admin.status === 'BANNED_TEMP' || admin.status === 'BANNED_PERM') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const statusRaw = String(body?.status ?? '').trim() as ReportStatus
  if (!ALLOWED_STATUSES.includes(statusRaw)) {
    return NextResponse.json({ error: 'invalid_status' }, { status: 400 })
  }

  const report = await db.userReport.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      reportedUserId: true,
      status: true,
      reportedUser: { select: { neighborhoodId: true, role: true } },
    },
  })
  if (!report) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Scope: NEIGHBORHOOD_MOD can only resolve reports against users in
  // their own neighborhood. Also, no admin below SUPER_ADMIN can resolve
  // a report against another admin account.
  const isPlatform = admin.role === 'PLATFORM_MOD' || admin.role === 'SUPER_ADMIN'
  if (!isPlatform) {
    if (report.reportedUser.neighborhoodId !== admin.neighborhoodId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  }
  if (
    admin.role !== 'SUPER_ADMIN' &&
    ['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD'].includes(report.reportedUser.role)
  ) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  try {
    const updated = await db.userReport.update({
      where: { id: report.id },
      data: { status: statusRaw },
      select: { id: true, status: true },
    })

    // Audit trail — piggyback on the existing ModerationLog so this
    // shows up in the admin activity feed next to post-report actions.
    await db.moderationLog.create({
      data: {
        adminId: admin.id,
        adminName: admin.name,
        action: `user_report_${statusRaw.toLowerCase()}`,
        targetType: 'user_report',
        targetId: report.id,
        reason: null,
        details: `target=${report.reportedUserId}`,
      },
    }).catch(() => {})

    console.log('[USER_REPORT] resolved', {
      id: updated.id,
      status: updated.status,
      adminId: admin.id,
    })
    return NextResponse.json({ ok: true, id: updated.id, status: updated.status })
  } catch (err) {
    console.error('[USER_REPORT] resolve failed', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

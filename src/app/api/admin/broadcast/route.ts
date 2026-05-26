import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { kickNotifCron } from '@/lib/kickNotifCron'

export const dynamic = 'force-dynamic'

async function requireSuperAdmin() {
  const session = await getSession()
  if (!session) return { ok: false as const, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const me = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!me || !isSuperAdminRole(me.role)) {
    return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true as const, userId: session.userId }
}

/** POST — super-admin sends a custom push to ALL users. */
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if (!gate.ok) return gate.res

  const body = await req.json().catch(() => ({}))
  // Collapse newlines + runs of whitespace to single spaces so the push and
  // the in-app preview flow naturally and don't waste a line on one word.
  const title = String(body?.title ?? '').replace(/\s+/g, ' ').trim()
  const text = String(body?.body ?? '').replace(/\s+/g, ' ').trim()
  if (title.length < 2 || title.length > 120) {
    return NextResponse.json({ error: 'العنوان يجب أن يكون بين 2 و 120 حرفاً' }, { status: 400 })
  }
  if (text.length < 2 || text.length > 1000) {
    return NextResponse.json({ error: 'النص يجب أن يكون بين 2 و 1000 حرف' }, { status: 400 })
  }

  const broadcast = await db.broadcast.create({
    data: { title, body: text, createdById: gate.userId },
    select: { id: true },
  })

  // Hand off to the notif cron — it resolves all device tokens + sends.
  await db.notifJob.create({
    data: {
      type: 'broadcast',
      priority: 'high',
      targetType: 'broadcast',
      targetRef: broadcast.id,
      payload: { broadcastId: broadcast.id, title, body: text },
    },
  })
  kickNotifCron()

  return NextResponse.json({ id: broadcast.id }, { status: 201 })
}

/** GET — list past broadcasts with reach + open (click) analytics. */
export async function GET() {
  const gate = await requireSuperAdmin()
  if (!gate.ok) return gate.res

  const rows = await db.broadcast.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, title: true, body: true, createdAt: true,
      reachedUsers: true, sentTokens: true,
      _count: { select: { clicks: true } },
    },
  })

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      createdAt: r.createdAt,
      reachedUsers: r.reachedUsers,
      sentTokens: r.sentTokens,
      opens: r._count.clicks,
    })),
  )
}

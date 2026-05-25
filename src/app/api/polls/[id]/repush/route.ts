import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { kickNotifCron } from '@/lib/kickNotifCron'

export const dynamic = 'force-dynamic'

/**
 * POST /api/polls/[id]/repush — SUPER_ADMIN only.
 *
 * Re-send (or first-send) the neighborhood push for a poll. Polls don't
 * notify on creation, so this lets a super-admin push a poll nobody saw
 * (e.g. one created during the DB outage). Enqueues a `poll_new` NotifJob to
 * the poll's neighborhood and kicks the cron. The push collapse-id is
 * `poll:<id>`, so repeated re-pushes replace each other on-device rather than
 * stacking. Returns { ok }.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  })
  if (!admin || admin.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const poll = await db.poll.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      question: true,
      neighborhoodId: true,
      author: { select: { id: true, name: true, lastName: true } },
    },
  })
  if (!poll) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (poll.status !== 'active') {
    return NextResponse.json({ error: 'poll_not_active' }, { status: 400 })
  }

  const authorName =
    [poll.author.name?.trim(), poll.author.lastName?.trim()].filter(Boolean).join(' ') ||
    poll.author.name ||
    null

  try {
    await db.notifJob.create({
      data: {
        type: 'poll_new',
        priority: 'high',
        targetType: 'nbhd_topic',
        targetRef: poll.neighborhoodId,
        payload: {
          pollId: poll.id,
          authorId: poll.author.id,
          authorName,
          question: poll.question,
        },
      },
    })
    kickNotifCron()
    console.log('[POLL_REPUSH] enqueued', { pollId: poll.id, by: session.userId })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[POLL_REPUSH] failed', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

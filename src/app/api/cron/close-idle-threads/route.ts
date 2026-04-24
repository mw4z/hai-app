import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Daily sweep that CLOSEs threads nobody has touched in a long time.
 * A thread's updatedAt bumps on every message POST (see
 * /api/threads/[id]/messages route), so "idle" = no new message on
 * either side for IDLE_DAYS. Closing flips status:'CLOSED' which:
 *
 *  - hides the thread from /api/threads (GET filters status='ACTIVE')
 *  - blocks new sends from either party (messages POST rejects on
 *    non-ACTIVE status)
 *  - still allows the post-rating flow if one side hasn't rated yet
 *    (that path already redirects CLOSED threads)
 *
 * Auth: Vercel cron header OR bearer token (CRON_SECRET).
 */

const IDLE_DAYS = 30

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }

async function handle(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') != null
  const auth = req.headers.get('authorization') || ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron) {
    if (!expected || auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const cutoff = new Date(Date.now() - IDLE_DAYS * 86400_000)

  const result = await db.thread.updateMany({
    where: {
      status: 'ACTIVE',
      updatedAt: { lt: cutoff },
    },
    data: { status: 'CLOSED' },
  })

  return NextResponse.json({
    ok: true,
    closed: result.count,
    cutoff: cutoff.toISOString(),
    idleDays: IDLE_DAYS,
  })
}

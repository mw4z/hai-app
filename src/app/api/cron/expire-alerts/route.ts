import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  return handle(req)
}
export async function POST(req: NextRequest) {
  return handle(req)
}

async function handle(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') != null
  const auth = req.headers.get('authorization') || ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron) {
    if (!expected || auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const now = new Date()
  const expiredCount = await db.emergencyAlert.count({
    where: { expiresAt: { lt: now }, revokedAt: null },
  })

  console.log('[EXPIRE_ALERTS] tick', {
    at: now.toISOString(),
    expiredNotRevoked: expiredCount,
  })

  return NextResponse.json({ ok: true, expired: expiredCount })
}

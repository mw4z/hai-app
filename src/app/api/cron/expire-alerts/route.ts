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
  // Always require bearer CRON_SECRET (audit C-4).
  const auth = req.headers.get('authorization') || ''
  const expected = process.env.CRON_SECRET
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // 1. Emergency alerts: query-driven expiry (no mutation needed)
  const expiredCount = await db.emergencyAlert.count({
    where: { expiresAt: { lt: now }, revokedAt: null },
  })

  // 2. Pending user-submitted requests: auto-EXPIRE after TTL so the
  //    mod queue doesn't fill up with stale items the requester forgot about.
  const staleRequests = await db.emergencyAlertRequest.updateMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: now },
    },
    data: {
      status: 'EXPIRED',
    },
  })

  console.log('[EXPIRE_ALERTS] tick', {
    at: now.toISOString(),
    expiredNotRevoked: expiredCount,
    expiredRequests: staleRequests.count,
  })

  return NextResponse.json({
    ok: true,
    expired: expiredCount,
    expiredRequests: staleRequests.count,
  })
}

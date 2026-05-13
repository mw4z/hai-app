import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

/** GET /api/poll-requests/mine — the caller's own poll suggestions. */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const requests = await db.pollRequest.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      title: true,
      options: true,
      reason: true,
      status: true,
      rejectionReason: true,
      reviewedAt: true,
      approvedPollId: true,
      createdAt: true,
    },
  })

  return NextResponse.json(requests)
}

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { reputation: true },
  })

  const recent = await db.reputationLog.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { action: true, points: true, createdAt: true },
  })

  return NextResponse.json({
    reputation: user?.reputation || 0,
    recent,
  })
}

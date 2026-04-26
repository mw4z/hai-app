import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { neighborhoodId: true },
  })
  if (!user?.neighborhoodId) return NextResponse.json([])

  const now = new Date()
  const alerts = await db.emergencyAlert.findMany({
    where: {
      neighborhoodId: user.neighborhoodId,
      expiresAt: { gt: now },
      revokedAt: null,
      dismissals: { none: { userId: session.userId } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      title: true,
      body: true,
      severity: true,
      expiresAt: true,
      author: { select: { name: true, lastName: true } },
    },
  })

  return NextResponse.json(
    alerts.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      severity: a.severity,
      expiresAt: a.expiresAt.toISOString(),
      authorName: [a.author?.name?.trim(), a.author?.lastName?.trim()].filter(Boolean).join(' ') || a.author?.name || null,
    })),
  )
}

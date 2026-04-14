import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const requests = await db.emergencyAlertRequest.findMany({
    where: { requesterId: session.userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      title: true,
      body: true,
      severity: true,
      status: true,
      rejectedReason: true,
      createdAt: true,
      expiresAt: true,
      reviewedAt: true,
    },
  })

  return NextResponse.json(
    requests.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      severity: r.severity,
      status: r.status,
      rejectedReason: r.rejectedReason,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    })),
  )
}

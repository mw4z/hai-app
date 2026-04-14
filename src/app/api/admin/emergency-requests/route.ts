import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']

/**
 * GET /api/admin/emergency-requests
 * Returns the emergency alert request queue for moderator review.
 *
 * Scope:
 *   - NEIGHBORHOOD_MOD → only their own neighborhood
 *   - PLATFORM_MOD / SUPER_ADMIN → all neighborhoods
 *
 * Includes PENDING by default, plus the most recent APPROVED/REJECTED
 * so mods can see what they just acted on without refreshing.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true },
  })
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const isPlatform = user.role === 'PLATFORM_MOD' || user.role === 'SUPER_ADMIN'
  const scope = isPlatform
    ? {}
    : user.neighborhoodId
      ? { neighborhoodId: user.neighborhoodId }
      : { id: 'none' }

  const now = new Date()
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const rows = await db.emergencyAlertRequest.findMany({
    where: {
      ...scope,
      OR: [
        { status: 'PENDING', expiresAt: { gt: now } },
        { status: { in: ['APPROVED', 'REJECTED'] }, reviewedAt: { gte: recentCutoff } },
      ],
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 50,
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
      neighborhoodId: true,
      neighborhood: { select: { name: true, nameEn: true } },
      requester: { select: { id: true, name: true, phone: true, reputation: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      severity: r.severity,
      status: r.status,
      rejectedReason: r.rejectedReason,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      neighborhood: r.neighborhood,
      requester: r.requester,
      reviewedBy: r.reviewedBy,
    })),
  )
}

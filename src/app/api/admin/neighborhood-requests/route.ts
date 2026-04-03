import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

const ADMIN_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']

// GET — list pending requests
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const requests = await db.neighborhoodChangeRequest.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(requests)
}

// POST — approve or reject a request
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!admin || !ADMIN_ROLES.includes(admin.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { requestId, action } = await req.json()
  if (!requestId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const request = await db.neighborhoodChangeRequest.findUnique({ where: { id: requestId } })
  if (!request || request.status !== 'pending') {
    return NextResponse.json({ error: 'Request not found or already reviewed' }, { status: 404 })
  }

  if (action === 'approve') {
    // Update user's neighborhood
    await db.user.update({
      where: { id: request.userId },
      data: { neighborhoodId: request.requestedNeighborhoodId },
    })

    // Log the change
    await db.neighborhoodChangeLog.create({
      data: {
        userId: request.userId,
        fromNeighborhoodId: request.currentNeighborhoodId,
        toNeighborhoodId: request.requestedNeighborhoodId,
        reason: request.reason,
        customReason: request.customReason,
        changedBy: 'admin',
      },
    })

    await db.neighborhoodChangeRequest.update({
      where: { id: requestId },
      data: { status: 'approved', reviewedBy: session.userId, reviewedAt: new Date() },
    })

    return NextResponse.json({ success: true, action: 'approved' })
  }

  // Reject
  await db.neighborhoodChangeRequest.update({
    where: { id: requestId },
    data: { status: 'rejected', reviewedBy: session.userId, reviewedAt: new Date() },
  })

  return NextResponse.json({ success: true, action: 'rejected' })
}

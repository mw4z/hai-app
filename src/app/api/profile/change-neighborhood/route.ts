import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

const MAX_CHANGES_PER_MONTH = 2
const VALID_REASONS = ['MOVED', 'TEMPORARY', 'OTHER']

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { neighborhoodId, reason, customReason } = await req.json()

  // Validate inputs
  if (!neighborhoodId) return NextResponse.json({ error: 'اختر الحي الجديد' }, { status: 400 })
  if (!reason || !VALID_REASONS.includes(reason)) return NextResponse.json({ error: 'اختر سبب التغيير' }, { status: 400 })
  if (reason === 'OTHER' && (!customReason || customReason.trim().length < 3)) {
    return NextResponse.json({ error: 'اشرح سبب التغيير' }, { status: 400 })
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Can't change to same neighborhood
  if (user.neighborhoodId === neighborhoodId) {
    return NextResponse.json({ error: 'هذا حيّك الحالي' }, { status: 400 })
  }

  // Verify target neighborhood exists
  const target = await db.neighborhood.findUnique({ where: { id: neighborhoodId }, select: { id: true } })
  if (!target) return NextResponse.json({ error: 'الحي غير موجود' }, { status: 400 })

  // Count changes this month
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const changesThisMonth = await db.neighborhoodChangeLog.count({
    where: {
      userId: session.userId,
      createdAt: { gte: startOfMonth },
    },
  })

  if (changesThisMonth >= MAX_CHANGES_PER_MONTH) {
    // Check if there's already a pending request
    const pendingRequest = await db.neighborhoodChangeRequest.findFirst({
      where: { userId: session.userId, status: 'pending' },
    })
    if (pendingRequest) {
      return NextResponse.json({ error: 'لديك طلب تغيير معلّق بالفعل' }, { status: 400 })
    }

    // Create approval request instead
    await db.neighborhoodChangeRequest.create({
      data: {
        userId: session.userId,
        currentNeighborhoodId: user.neighborhoodId!,
        requestedNeighborhoodId: neighborhoodId,
        reason,
        customReason: customReason?.trim() || null,
      },
    })

    return NextResponse.json({ type: 'request', message: 'تم إرسال طلب تغيير الحي للمشرف' })
  }

  // Direct change — under the limit
  await db.user.update({
    where: { id: session.userId },
    data: { neighborhoodId },
  })

  await db.neighborhoodChangeLog.create({
    data: {
      userId: session.userId,
      fromNeighborhoodId: user.neighborhoodId!,
      toNeighborhoodId: neighborhoodId,
      reason,
      customReason: customReason?.trim() || null,
    },
  })

  return NextResponse.json({ type: 'changed', message: 'تم تغيير حيّك بنجاح' })
}

// GET — returns change info for the current user
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const changesThisMonth = await db.neighborhoodChangeLog.count({
    where: { userId: session.userId, createdAt: { gte: startOfMonth } },
  })

  const pendingRequest = await db.neighborhoodChangeRequest.findFirst({
    where: { userId: session.userId, status: 'pending' },
    select: { id: true, status: true, createdAt: true },
  })

  return NextResponse.json({
    changesThisMonth,
    maxChangesPerMonth: MAX_CHANGES_PER_MONTH,
    remaining: Math.max(0, MAX_CHANGES_PER_MONTH - changesThisMonth),
    pendingRequest: pendingRequest || null,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { neighborhoodId: true },
  })
  const alert = await db.emergencyAlert.findUnique({
    where: { id: params.id },
    select: { id: true, neighborhoodId: true },
  })
  if (!alert) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (user?.neighborhoodId && alert.neighborhoodId !== user.neighborhoodId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  try {
    await db.emergencyAlertDismissal.upsert({
      where: {
        alertId_userId: { alertId: params.id, userId: session.userId },
      },
      create: { alertId: params.id, userId: session.userId },
      update: {},
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[EMERGENCY_ALERT] dismiss failed', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

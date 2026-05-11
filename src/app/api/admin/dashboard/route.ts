import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAdminDashboardData } from '@/lib/adminDashboard'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await getAdminDashboardData(session.userId)
  if (!data) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json(data)
}

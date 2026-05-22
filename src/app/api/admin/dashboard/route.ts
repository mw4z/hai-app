import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { getAdminDashboardData } from '@/lib/adminDashboard'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Admin-portal overview — SUPER_ADMIN only. Mods use /mod.
  const me = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!me || !isSuperAdminRole(me.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const data = await getAdminDashboardData(session.userId)
  if (!data) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json(data)
}

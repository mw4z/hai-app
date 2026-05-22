import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { getAdminDashboardData } from '@/lib/adminDashboard'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import AdminClient from './AdminClient'

export default async function AdminPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, name: true, lastName: true },
  })

  // The admin portal is SUPER_ADMIN only. Moderators have their own
  // neighborhood-scoped dashboard at /mod — send them there rather than
  // exposing the full platform portal.
  if (!user) redirect('/login')
  if (!isSuperAdminRole(user.role)) {
    redirect(user.role === 'RESIDENT' ? '/feed' : '/mod')
  }

  // Server-render the overview stats + recent logs so the dashboard's
  // first screen is populated on first paint — no fetch-then-pop-in.
  // The client still polls /api/admin/dashboard every 15s.
  const dashboard = await getAdminDashboardData(session.userId).catch(() => null)

  const adminFullName = [user.name?.trim(), user.lastName?.trim()].filter(Boolean).join(' ') || user.name || 'Admin'
  return <AdminClient role={user.role} adminName={adminFullName} initialDashboard={dashboard} />
}

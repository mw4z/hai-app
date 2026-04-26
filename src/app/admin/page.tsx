import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import AdminClient from './AdminClient'

const ADMIN_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']

export default async function AdminPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, name: true, lastName: true },
  })

  if (!user || !ADMIN_ROLES.includes(user.role)) redirect('/feed')

  const adminFullName = [user.name?.trim(), user.lastName?.trim()].filter(Boolean).join(' ') || user.name || 'Admin'
  return <AdminClient role={user.role} adminName={adminFullName} />
}

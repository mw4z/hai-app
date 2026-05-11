import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import EditProfileClient from './EditProfileClient'

export default async function EditProfilePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Server-render the current name so the field is pre-filled on first
  // paint — no spinner-then-field.
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { name: true },
  }).catch(() => null)

  return <EditProfileClient initialName={user?.name || ''} />
}

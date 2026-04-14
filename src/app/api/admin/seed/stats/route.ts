import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSeedStats } from '@/lib/seed-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  })
  if (!user || user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const stats = await getSeedStats()
  return NextResponse.json(stats)
}

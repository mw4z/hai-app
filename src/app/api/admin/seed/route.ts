import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { seedAllNeighborhoods, seedNeighborhood } from '@/lib/seed-service'

const ADMIN_ROLES = ['PLATFORM_MOD', 'SUPER_ADMIN']

// POST /api/admin/seed — seed all or a specific neighborhood
// Body: { neighborhoodId?: string }
// Also supports cron via secret header: x-cron-secret
export async function POST(req: NextRequest) {
  // Auth: either admin user or cron secret
  const cronSecret = req.headers.get('x-cron-secret')
  const isValidCron = cronSecret && cronSecret === process.env.CRON_SECRET

  if (!isValidCron) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { role: true },
    })
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const body = await req.json().catch(() => ({}))
  const { neighborhoodId } = body as { neighborhoodId?: string }

  if (neighborhoodId) {
    const count = await seedNeighborhood(neighborhoodId)
    return NextResponse.json({ success: true, seeded: count, neighborhoodId })
  }

  const result = await seedAllNeighborhoods()
  return NextResponse.json({ success: true, ...result })
}

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canVerifyProviders } from '@/lib/modPermissions'

export const dynamic = 'force-dynamic'

/**
 * GET /api/mod/verification — pending VERIFIED_PROVIDER requests.
 * PLATFORM_MOD + SUPER_ADMIN only (platform-wide trust action).
 * NEIGHBORHOOD_MOD / residents → 403. Enforced here, not just in the UI.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const me = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!me || !canVerifyProviders(me.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const vrs = await db.verificationRequest.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })
  const enriched = await Promise.all(
    vrs.map(async (v) => {
      const u = await db.user.findUnique({
        where: { id: v.userId },
        select: { name: true, lastName: true, phone: true },
      })
      return {
        id: v.id,
        businessName: v.businessName,
        description: v.description,
        proofUrl: v.proofUrl,
        createdAt: v.createdAt.toISOString(),
        userName: [u?.name?.trim(), u?.lastName?.trim()].filter(Boolean).join(' ') || u?.name || null,
        userPhone: u?.phone || null,
      }
    }),
  )
  return NextResponse.json({ requests: enriched })
}

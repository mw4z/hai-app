import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canModerateUsers, canControlUser } from '@/lib/modPermissions'

export const dynamic = 'force-dynamic'

/**
 * GET /api/mod/users?q= — moderation user list (block / stop only).
 * NEIGHBORHOOD_MOD is scoped to their own neighborhood; PLATFORM_MOD /
 * SUPER_ADMIN see all. `controllable` tells the UI whether THIS mod may
 * act on the row — false for admin/mod accounts unless the caller is
 * SUPER_ADMIN (the action API enforces the same rule independently).
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true },
  })
  if (!me || !canModerateUsers(me.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  const isPlatform = me.role === 'PLATFORM_MOD' || me.role === 'SUPER_ADMIN'

  const where: any = {
    // Only real members — hide incomplete signups (OTP-only rows with a
    // phone but no name yet).
    name: { not: null },
    ...(isPlatform ? {} : { neighborhoodId: me.neighborhoodId ?? '__none__' }),
    ...(q
      ? {
          OR: [
            { phone: { contains: q } },
            { name: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const users = await db.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: q ? 60 : 40,
    select: {
      id: true, name: true, lastName: true, phone: true, role: true,
      status: true, reputation: true, neighborhood: { select: { name: true } },
    },
  })

  return NextResponse.json({
    users: users.filter((u) => (u.name ?? '').trim().length > 0).map((u) => ({
      id: u.id,
      name: [u.name?.trim(), u.lastName?.trim()].filter(Boolean).join(' ') || u.name || null,
      phone: u.phone,
      role: u.role,
      status: u.status,
      reputation: u.reputation,
      neighborhood: u.neighborhood?.name ?? null,
      // Self can't be acted on; admins only by SUPER_ADMIN.
      controllable: u.id !== session.userId && canControlUser(me.role, u.role),
    })),
  })
}

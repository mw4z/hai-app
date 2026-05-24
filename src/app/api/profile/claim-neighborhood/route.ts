import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { requireUserReady } from '@/lib/requireUserReady'
import { HOME_CHANGE_COOLDOWN_MS } from '@/lib/membership'
import { cacheDelete } from '@/lib/cache'

/**
 * POST /api/profile/claim-neighborhood  { neighborhoodId, note? }
 *
 * Manually claim a home neighborhood while OUTSIDE its polygon (can't pass
 * GPS right now). Sets membership = CLAIMED_RESIDENT (limited rights until
 * verified by GPS or a mod). Abuse controls:
 *   - one active claimed home at a time (prior PENDING claims superseded)
 *   - 30-day cooldown before switching to a DIFFERENT home
 *   - rate limit: max 3 claim attempts per 24h
 *   - every attempt logged as a NeighborhoodClaim row
 */
const MAX_CLAIMS_PER_DAY = 3

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Profile must be complete; location is NOT required (that's the point).
  const ready = await requireUserReady(session.userId, { requireProfile: true, requireLocation: false })
  if (!ready.ok) return ready.response

  const body = await req.json().catch(() => ({}))
  const neighborhoodId = typeof body?.neighborhoodId === 'string' ? body.neighborhoodId : ''
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 300) : null
  if (!neighborhoodId) return NextResponse.json({ error: 'neighborhoodId_required' }, { status: 400 })

  const neighborhood = await db.neighborhood.findUnique({
    where: { id: neighborhoodId },
    select: { id: true, hidden: true },
  })
  if (!neighborhood || neighborhood.hidden) {
    return NextResponse.json({ error: 'neighborhood_not_found' }, { status: 404 })
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { neighborhoodId: true, membership: true, status: true, homeChangeCooldownUntil: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (user.status === 'BANNED_TEMP' || user.status === 'BANNED_PERM') {
    return NextResponse.json({ error: 'حسابك موقوف' }, { status: 403 })
  }

  const now = Date.now()
  const isSameHome = user.neighborhoodId === neighborhoodId

  // Cooldown — only blocks switching to a DIFFERENT neighborhood.
  if (!isSameHome && user.homeChangeCooldownUntil && user.homeChangeCooldownUntil.getTime() > now) {
    const daysLeft = Math.ceil((user.homeChangeCooldownUntil.getTime() - now) / (24 * 60 * 60_000))
    return NextResponse.json(
      { error: 'home_change_cooldown', message: `لا يمكن تغيير حيّك إلا بعد ${daysLeft} يوم`, daysLeft },
      { status: 429 },
    )
  }

  // Already a verified resident of this exact hood — nothing to claim.
  if (isSameHome && user.membership === 'VERIFIED_RESIDENT') {
    return NextResponse.json({ ok: true, membership: 'VERIFIED_RESIDENT', unchanged: true })
  }

  // Rate limit claim attempts.
  const since = new Date(now - 24 * 60 * 60_000)
  const recent = await db.neighborhoodClaim.count({ where: { userId: session.userId, createdAt: { gte: since } } })
  if (recent >= MAX_CLAIMS_PER_DAY) {
    return NextResponse.json({ error: 'too_many_claims', message: 'حاول مجدداً لاحقاً' }, { status: 429 })
  }

  // One active claim at a time — supersede any prior PENDING claims.
  await db.neighborhoodClaim.updateMany({
    where: { userId: session.userId, status: 'PENDING' },
    data: { status: 'REJECTED', reviewedAt: new Date(), note: 'superseded' },
  })

  // Switching home resets the cooldown; re-affirming the same home does not
  // extend it further than needed.
  const cooldownUntil = new Date(now + HOME_CHANGE_COOLDOWN_MS)

  await db.$transaction([
    db.user.update({
      where: { id: session.userId },
      data: {
        neighborhoodId,
        membership: 'CLAIMED_RESIDENT',
        addressVerified: false,
        homeClaimedAt: new Date(),
        homeChangeCooldownUntil: cooldownUntil,
      },
    }),
    db.neighborhoodClaim.create({
      data: { userId: session.userId, neighborhoodId, status: 'PENDING', note },
    }),
  ])

  cacheDelete(`user:${session.userId}`)

  return NextResponse.json({ ok: true, membership: 'CLAIMED_RESIDENT' })
}

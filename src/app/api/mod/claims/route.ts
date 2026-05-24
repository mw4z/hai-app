import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canModerateUsers } from '@/lib/modPermissions'
import { logModAction } from '@/lib/modAudit'

export const dynamic = 'force-dynamic'

/**
 * Claimed-resident review queue.
 *
 * GET  → pending NeighborhoodClaims (neighborhood mods: own hood only;
 *        platform/super: all).
 * POST { claimId, action: 'approve' | 'reject' }
 *        approve → upgrade the user to VERIFIED_RESIDENT.
 *        reject  → mark the claim rejected; user stays CLAIMED_RESIDENT.
 */
async function getMod(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, neighborhoodId: true, name: true, status: true },
  })
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const mod = await getMod(session.userId)
  if (!mod || !canModerateUsers(mod.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (mod.status === 'BANNED_TEMP' || mod.status === 'BANNED_PERM') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const isPlatform = mod.role === 'PLATFORM_MOD' || mod.role === 'SUPER_ADMIN'
  const claims = await db.neighborhoodClaim.findMany({
    where: {
      status: 'PENDING',
      ...(isPlatform ? {} : { neighborhoodId: mod.neighborhoodId ?? '__none__' }),
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: {
      id: true, note: true, createdAt: true,
      user: { select: { id: true, name: true, lastName: true, phone: true, reputation: true, avatarUrl: true } },
      neighborhood: { select: { id: true, name: true, nameEn: true } },
    },
  })
  return NextResponse.json({ claims })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const mod = await getMod(session.userId)
  if (!mod || !canModerateUsers(mod.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (mod.status === 'BANNED_TEMP' || mod.status === 'BANNED_PERM') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const claimId = typeof body?.claimId === 'string' ? body.claimId : ''
  const action = body?.action === 'approve' ? 'approve' : body?.action === 'reject' ? 'reject' : ''
  if (!claimId || !action) return NextResponse.json({ error: 'invalid_params' }, { status: 400 })

  const claim = await db.neighborhoodClaim.findUnique({
    where: { id: claimId },
    select: { id: true, userId: true, neighborhoodId: true, status: true },
  })
  if (!claim) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (claim.status !== 'PENDING') return NextResponse.json({ error: 'already_reviewed' }, { status: 409 })

  // Neighborhood mods can only review claims for their own hood.
  const isPlatform = mod.role === 'PLATFORM_MOD' || mod.role === 'SUPER_ADMIN'
  if (!isPlatform && claim.neighborhoodId !== mod.neighborhoodId) {
    return NextResponse.json({ error: 'out_of_jurisdiction' }, { status: 403 })
  }

  if (action === 'approve') {
    await db.$transaction([
      db.user.update({
        where: { id: claim.userId },
        data: {
          membership: 'VERIFIED_RESIDENT',
          addressVerified: true,
          neighborhoodId: claim.neighborhoodId,
          homeChangeCooldownUntil: null,
        },
      }),
      db.neighborhoodClaim.update({
        where: { id: claim.id },
        data: { status: 'APPROVED', reviewedById: mod.id, reviewedAt: new Date() },
      }),
    ])
  } else {
    await db.neighborhoodClaim.update({
      where: { id: claim.id },
      data: { status: 'REJECTED', reviewedById: mod.id, reviewedAt: new Date() },
    })
  }

  await logModAction({
    moderatorId: mod.id,
    actionType: action === 'approve' ? 'approve_claim' : 'reject_claim',
    targetType: 'user',
    targetId: claim.userId,
    neighborhoodId: claim.neighborhoodId,
    details: JSON.stringify({ claimId: claim.id }),
  }).catch(() => { /* best-effort audit */ })

  return NextResponse.json({ success: true })
}

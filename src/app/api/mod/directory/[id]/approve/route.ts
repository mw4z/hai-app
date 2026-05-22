import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { gateModRoute } from '@/lib/places/routeGate'
import { logModAction } from '@/lib/modAudit'
import { createNotification } from '@/lib/notifications'
import { awardDirectoryReputation } from '@/lib/reputation/awardDirectoryReputation'
import { assessPlaceQuality } from '@/lib/reputation/directoryRewards'

export const dynamic = 'force-dynamic'

/** POST /api/mod/directory/[id]/approve
 *
 *  Body: { confidence?: 'verified' | 'unverified', notes?: string }
 *
 *  'verified'   (default) → status MOD_VERIFIED, "موثّق من المشرف"
 *  'unverified'           → status VISIBLE_UNVERIFIED, "غير مؤكد"
 *
 *  Both branches mark the place visible. Mods who aren't sure
 *  about the data can still publish at VISIBLE_UNVERIFIED so
 *  residents can find it; they keep the "غير مؤكد" badge until
 *  a follow-up review or owner-claim. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const gate = gateModRoute(user.role)
  if (gate) return gate

  const place = await db.placeListing.findUnique({
    where: { id: params.id },
    select: { id: true, neighborhoodId: true, status: true, createdByUserId: true, name: true },
  })
  if (!place) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // NEIGHBORHOOD_MOD scoping.
  if (user.role === 'NEIGHBORHOOD_MOD' && place.neighborhoodId !== user.neighborhoodId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (place.status !== 'PENDING' && place.status !== 'VISIBLE_UNVERIFIED') {
    return NextResponse.json({ error: 'invalid_state' }, { status: 409 })
  }

  const body = (await req.json().catch(() => ({}))) as { confidence?: string }
  const newStatus =
    body.confidence === 'unverified' ? 'VISIBLE_UNVERIFIED' : 'MOD_VERIFIED'

  const updated = await db.placeListing.update({
    where: { id: place.id },
    data: {
      status: newStatus,
      verifiedByModId: user.id,
      verifiedAt: new Date(),
      rejectionReason: null,
    },
    select: { id: true },
  })

  await logModAction({
    moderatorId: user.id,
    actionType: 'approve_place',
    targetType: 'place',
    targetId: place.id,
    neighborhoodId: place.neighborhoodId,
    details: JSON.stringify({ status: newStatus }),
  })

  // Notify submitter — reuse the SYSTEM type per the spec.
  if (place.createdByUserId && place.createdByUserId !== user.id) {
    await createNotification({
      type: 'SYSTEM',
      userId: place.createdByUserId,
      actorId: user.id,
      actorName: 'مشرف الحي',
      postId: place.id,
      postTitle: `تمت الموافقة على إضافة "${place.name}" إلى دليل الحي`,
    }).catch(() => { /* notification failure shouldn't block approval */ })
  }

  // ── Reputation ────────────────────────────────────────────────
  // Mark the CREATE_PLACE contribution APPROVED and award the submitter.
  // Idempotent twice over: only PENDING/NEEDS_EDIT contributions are
  // picked up (a re-approve finds none), and awardDirectoryReputation
  // itself no-ops if a ReputationEvent for this source already exists.
  try {
    const contribution = await db.directoryContribution.findFirst({
      where: { placeId: place.id, type: 'CREATE_PLACE', status: { in: ['PENDING_REVIEW', 'NEEDS_EDIT'] } },
      select: { id: true, contributorId: true, potentialDuplicate: true },
    })
    if (contribution) {
      const full = await db.placeListing.findUnique({
        where: { id: place.id },
        select: {
          name: true, category: true, latitude: true, longitude: true,
          addressText: true, description: true, phone: true, whatsapp: true,
          website: true, instagram: true,
        },
      })
      const highQuality = !!full && assessPlaceQuality({ ...full, potentialDuplicate: contribution.potentialDuplicate })
      await db.directoryContribution.update({
        where: { id: contribution.id },
        data: { status: 'APPROVED', reviewedById: user.id, reviewedAt: new Date() },
      })
      await awardDirectoryReputation({
        contributionId: contribution.id,
        userId: contribution.contributorId,
        type: 'CREATE_PLACE',
        placeId: place.id,
        highQuality,
      })
    }
  } catch (err) {
    console.error('[approve] reputation award failed:', err)
  }

  return NextResponse.json({ ok: true, id: updated.id, status: newStatus })
}

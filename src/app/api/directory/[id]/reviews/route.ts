import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { gatePublicRoute } from '@/lib/places/routeGate'
import { isDirectoryModerator } from '@/lib/places/isDirectoryModerator'
import { PUBLIC_PLACE_STATUSES } from '@/lib/places/statusBadge'
import { recalcPlaceRating } from '@/lib/places/recalcRating'
import { createNotification } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

const BODY_MAX = 500
const DAILY_LIMIT = 10
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * GET /api/directory/[id]/reviews
 *
 * Returns the place's VISIBLE reviews (newest first) plus the
 * caller's own review if it's hidden / soft-deleted (so they
 * see why their submission isn't showing publicly).
 *
 * Visibility mirrors the detail-page rules: the place must be
 * publicly visible OR the caller is creator / claimed owner /
 * scoped mod.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const gate = gatePublicRoute(user.role)
  if (gate) return gate

  const place = await db.placeListing.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      neighborhoodId: true,
      status: true,
      claimedByUserId: true,
      createdByUserId: true,
      ratingAvg: true,
      ratingCount: true,
    },
  })
  if (!place) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const isSuper = isSuperAdminRole(user.role)
  const isMod = isDirectoryModerator(user.role)
  const sameNbhd = place.neighborhoodId === user.neighborhoodId
  const isCreator = place.createdByUserId === user.id
  const isOwner = place.claimedByUserId === user.id
  const isPublicly = (PUBLIC_PLACE_STATUSES as string[]).includes(place.status)
  const allowed =
    isSuper ||
    (isMod && user.role === 'PLATFORM_MOD') ||
    (isMod && user.role === 'NEIGHBORHOOD_MOD' && sameNbhd) ||
    isCreator ||
    isOwner ||
    isPublicly
  if (!allowed) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Public visible reviews (newest first).
  const visible = await db.placeReview.findMany({
    where: { placeId: place.id, status: 'VISIBLE' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      rating: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      ownerReplyBody: true,
      ownerReplyAt: true,
      user: {
        select: { id: true, name: true, avatarUrl: true, providerStatus: true },
      },
      ownerReplyByUser: {
        select: { id: true, name: true, avatarUrl: true, providerStatus: true },
      },
    },
  })

  // The caller's own review (even if hidden / deleted) — so the
  // UI can render "your review is awaiting moderation" / "you
  // hid your review" affordances without a second round-trip.
  const mine = await db.placeReview.findUnique({
    where: { placeId_userId: { placeId: place.id, userId: user.id } },
    select: {
      id: true,
      rating: true,
      body: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      ownerReplyBody: true,
      ownerReplyAt: true,
    },
  })

  return NextResponse.json({
    reviews: visible,
    mine,
    summary: { avg: place.ratingAvg, count: place.ratingCount },
  })
}

/**
 * POST /api/directory/[id]/reviews
 *
 * Create or update the caller's review (UPSERT on
 * [placeId, userId]). Server validates everything:
 *   - rating in 1..5
 *   - body length ≤ 500
 *   - place is publicly visible (PUBLIC_PLACE_STATUSES)
 *   - caller is in the place's neighborhood (or is a scoped mod / admin)
 *   - caller is NOT the createdByUser nor the claimedByUser
 *     (block both — a business owner could have added the
 *     place as a resident and pre-rated it before claiming)
 *   - caller hasn't been hide-banned on this review
 *     (status == HIDDEN_BY_MOD → 403)
 *   - daily limit: 10 reviews/day per user; mods/admin bypass
 *
 * Recomputes ratingAvg + ratingCount in the same transaction.
 * Notifies the claimed owner on a NEW review (not on update).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, status: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const gate = gatePublicRoute(user.role)
  if (gate) return gate

  const isSuper = isSuperAdminRole(user.role)
  if (!isSuper && (user.status === 'BANNED_TEMP' || user.status === 'BANNED_PERM')) {
    return NextResponse.json({ error: 'حسابك موقوف' }, { status: 403 })
  }

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const ratingRaw = raw.rating
  const rating = typeof ratingRaw === 'number' ? Math.floor(ratingRaw) : Number.NaN
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'التقييم يجب أن يكون من 1 إلى 5' }, { status: 400 })
  }
  let body: string | null = null
  if (raw.body !== undefined) {
    const v = typeof raw.body === 'string' ? raw.body.trim() : ''
    if (v.length > BODY_MAX) {
      return NextResponse.json({ error: 'الملاحظة طويلة' }, { status: 400 })
    }
    body = v || null
  }

  const place = await db.placeListing.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      neighborhoodId: true,
      status: true,
      claimedByUserId: true,
      createdByUserId: true,
    },
  })
  if (!place) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!(PUBLIC_PLACE_STATUSES as string[]).includes(place.status)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // No self-reviews. createdByUser blocked too (a business
  // owner could add their place as a resident and rate it
  // before claiming).
  if (place.createdByUserId === user.id || place.claimedByUserId === user.id) {
    return NextResponse.json({ error: 'لا يمكنك تقييم مكانك' }, { status: 403 })
  }

  // Neighborhood scope. Mods + admin can bypass (testing).
  const isMod = isDirectoryModerator(user.role)
  const sameNbhd = place.neighborhoodId === user.neighborhoodId
  if (!isSuper && !isMod && !sameNbhd) {
    return NextResponse.json({ error: 'لا يمكنك تقييم مكان خارج حيك' }, { status: 403 })
  }

  // Daily rate limit (residents). 10 reviews/day, rolling.
  if (!isSuper && !isMod) {
    const since = new Date(Date.now() - DAY_MS)
    const recent = await db.placeReview.count({
      where: { userId: user.id, createdAt: { gte: since } },
    })
    if (recent >= DAILY_LIMIT) {
      return NextResponse.json(
        { error: 'وصلت الحد الأقصى للتقييمات اليوم' },
        { status: 429 },
      )
    }
  }

  // Was there an existing review? Used to: (a) reject if it's
  // currently hidden by a mod (no dodging via re-create), and
  // (b) decide whether to notify the owner (only on first
  // creation, not on every edit).
  const existing = await db.placeReview.findUnique({
    where: { placeId_userId: { placeId: place.id, userId: user.id } },
    select: { id: true, status: true },
  })
  if (existing && existing.status === 'HIDDEN_BY_MOD') {
    return NextResponse.json(
      { error: 'تم إخفاء تقييمك من قبل المشرف' },
      { status: 403 },
    )
  }

  await db.$transaction(async (tx) => {
    await tx.placeReview.upsert({
      where: { placeId_userId: { placeId: place.id, userId: user.id } },
      create: {
        placeId: place.id,
        userId: user.id,
        rating,
        body,
        status: 'VISIBLE',
      },
      update: {
        rating,
        body,
        // If the user soft-deleted previously, re-posting brings
        // the row back to VISIBLE. Mod-hidden is rejected above.
        status: 'VISIBLE',
      },
    })
    await recalcPlaceRating(place.id, tx)
  })

  // Notify owner on FIRST review only (not on every update).
  // Skip if reviewer is somehow the owner (shouldn't happen —
  // gated above — but defensive).
  if (
    place.claimedByUserId &&
    place.claimedByUserId !== user.id &&
    (!existing || existing.status === 'DELETED_BY_USER')
  ) {
    await createNotification({
      type: 'SYSTEM',
      userId: place.claimedByUserId,
      actorId: user.id,
      postId: place.id,
      postTitle: `وصلك تقييم جديد على ${place.name}`,
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}

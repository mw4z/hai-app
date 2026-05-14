import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { PlaceCategory, type Prisma } from '@prisma/client'
import { gatePublicRoute } from '@/lib/places/routeGate'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { validatePlaceInput, placeLimitForUser, PLACE_LIMIT_WINDOW_MS } from '@/lib/places/validation'
import { toPublicPlace } from '@/lib/places/serialize'
import { PUBLIC_PLACE_STATUSES } from '@/lib/places/statusBadge'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30

/**
 * GET /api/directory
 *
 *   ?category=PHARMACY       (optional, single PlaceCategory)
 *   ?q=صيدلية                (optional, free-text — matches name + addressText)
 *
 * Scope: user's neighborhood only. SUPER_ADMIN can pass ?neighborhood=<id>
 * to inspect another nbhd; everyone else is locked to their own.
 *
 * Statuses returned: only the public-visible set (VISIBLE_UNVERIFIED,
 * MOD_VERIFIED, CLAIMED_BY_OWNER). PENDING / REJECTED / REMOVED are
 * filtered out — those surface only through /api/directory/mine for
 * the submitter or /api/mod/directory for moderators.
 *
 * Response: { places: PublicPlace[] }. createdByUser is never exposed.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const gate = gatePublicRoute(user.role)
  if (gate) return gate

  const url = req.nextUrl
  const isSuper = isSuperAdminRole(user.role)
  const targetNeighborhoodId =
    isSuper && url.searchParams.get('neighborhood')
      ? String(url.searchParams.get('neighborhood'))
      : user.neighborhoodId
  if (!targetNeighborhoodId) {
    return NextResponse.json({ places: [] })
  }

  const categoryParam = url.searchParams.get('category')
  const category =
    categoryParam && (Object.values(PlaceCategory) as string[]).includes(categoryParam)
      ? (categoryParam as PlaceCategory)
      : undefined

  const q = (url.searchParams.get('q') || '').trim().slice(0, 80)

  const where: Prisma.PlaceListingWhereInput = {
    neighborhoodId: targetNeighborhoodId,
    status: { in: PUBLIC_PLACE_STATUSES },
    ...(category ? { category } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { addressText: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const places = await db.placeListing.findMany({
    where,
    orderBy: [
      // Pin claimed and mod-verified places to the top so directory
      // browsers see the higher-confidence rows first.
      { status: 'desc' },
      { createdAt: 'desc' },
    ],
    take: PAGE_SIZE,
    include: {
      claimedByUser: {
        select: { id: true, name: true, avatarUrl: true, providerStatus: true },
      },
    },
  })

  return NextResponse.json({ places: places.map(toPublicPlace) })
}

/**
 * POST /api/directory
 *
 * Body:
 *   name, category, description?, phone?, whatsapp?, website?,
 *   instagram?, mapUrl?, latitude?, longitude?, addressText?,
 *   openingHours?
 *
 * imageUrls is silently stripped — Phase 1.5 will reintroduce
 * image uploads through a dedicated path.
 *
 * Rate limit: 3 / 7 days for normal residents, 7 / 7 days when
 * reputation ≥ 150. SUPER_ADMIN / directory mods bypass.
 *
 * Initial status: PENDING. Once we have a "neighborhood has no
 * active mods" signal we can flip new submissions to
 * VISIBLE_UNVERIFIED automatically; for MVP everything ships
 * through mod review.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      role: true,
      status: true,
      neighborhoodId: true,
      reputation: true,
    },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const gate = gatePublicRoute(user.role)
  if (gate) return gate

  if (!user.neighborhoodId) {
    return NextResponse.json({ error: 'أكمل ملفك الشخصي أولاً' }, { status: 403 })
  }
  const isSuper = isSuperAdminRole(user.role)
  if (!isSuper && (user.status === 'BANNED_TEMP' || user.status === 'BANNED_PERM')) {
    return NextResponse.json({ error: 'حسابك موقوف' }, { status: 403 })
  }

  const raw = await req.json().catch(() => null)
  if (!raw || typeof raw !== 'object') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  // ── Validate the payload. imageUrls is intentionally NOT in the
  //    PlaceInput shape — even if a client puts it in the body it
  //    falls through to PlaceInput's ignore list and is dropped here.
  const v = validatePlaceInput(raw)
  if (!v.ok) {
    return NextResponse.json({ error: v.error, field: v.field }, { status: 400 })
  }

  // ── Rate limit ─────────────────────────────────────────────────
  if (!isSuper) {
    const since = new Date(Date.now() - PLACE_LIMIT_WINDOW_MS)
    const recent = await db.placeListing.count({
      where: { createdByUserId: user.id, createdAt: { gte: since } },
    })
    const limit = placeLimitForUser(user.reputation)
    if (recent >= limit) {
      return NextResponse.json(
        { error: 'وصلت الحد الأقصى لإضافة الأماكن هذا الأسبوع' },
        { status: 429 },
      )
    }
  }

  // ── Dupe check: same neighborhood + normalized name + category ─
  // Returns 409 with the existing place id so the client can
  // suggest "هل تقصد هذا المكان؟".
  const existing = await db.placeListing.findFirst({
    where: {
      neighborhoodId: user.neighborhoodId,
      nameNormalized: v.value.nameNormalized,
      category: v.value.category,
      status: { not: 'REJECTED' },
    },
    select: { id: true, name: true, status: true },
  })
  if (existing) {
    return NextResponse.json(
      {
        error: 'duplicate_place',
        existing: { id: existing.id, name: existing.name, status: existing.status },
      },
      { status: 409 },
    )
  }

  const place = await db.placeListing.create({
    data: {
      neighborhoodId: user.neighborhoodId,
      name: v.value.name,
      nameNormalized: v.value.nameNormalized,
      category: v.value.category,
      description: v.value.description,
      phone: v.value.phone,
      whatsapp: v.value.whatsapp,
      website: v.value.website,
      instagram: v.value.instagram,
      mapUrl: v.value.mapUrl,
      latitude: v.value.latitude,
      longitude: v.value.longitude,
      addressText: v.value.addressText,
      openingHours: v.value.openingHours,
      // imageUrls left at default [] — write-disabled in MVP.
      status: 'PENDING',
      createdByUserId: user.id,
    },
    include: {
      claimedByUser: {
        select: { id: true, name: true, avatarUrl: true, providerStatus: true },
      },
    },
  })

  return NextResponse.json({ ok: true, place: toPublicPlace(place) })
}

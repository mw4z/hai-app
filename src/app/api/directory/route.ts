import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { PlaceCategory, type Prisma } from '@prisma/client'
import { gatePublicRoute } from '@/lib/places/routeGate'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { validatePlaceInput, placeLimitForUser, PLACE_LIMIT_WINDOW_MS, sanitizeImageUrls } from '@/lib/places/validation'
import { toPublicPlace } from '@/lib/places/serialize'
import { PUBLIC_PLACE_STATUSES } from '@/lib/places/statusBadge'
import {
  parseDirectoryFilters,
  buildDirectoryWhere,
  buildDirectoryOrderBy,
  applyOpenNowFilter,
} from '@/lib/places/directoryFilters'
import { matchesArabic } from '@/lib/arabicNormalize'
import { placeSnapshot } from '@/lib/places/googlePlaces'

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
  // Any authenticated user may read another neighborhood's directory
  // by passing ?neighborhood=<id> — matches the cross-neighborhood
  // browse pattern used by /api/feed. Writes (POST below) stay locked
  // to user.neighborhoodId, so cross-nbhd is read-only at the API
  // surface regardless of which UI hits this endpoint.
  const queryNbhd = url.searchParams.get('neighborhood')
  const targetNeighborhoodId =
    (queryNbhd && queryNbhd.length > 0 ? queryNbhd : user.neighborhoodId)
  if (!targetNeighborhoodId) {
    return NextResponse.json({ places: [] })
  }

  const categoryParam = url.searchParams.get('category')
  const category =
    categoryParam && (Object.values(PlaceCategory) as string[]).includes(categoryParam)
      ? (categoryParam as PlaceCategory)
      : undefined

  const q = (url.searchParams.get('q') || '').trim().slice(0, 80)

  // Pro-filter knobs: minRating, openNow, verifiedOnly, hasPhotos,
  // sort. All optional; defaults preserve legacy behaviour
  // (status DESC, createdAt DESC, PUBLIC_PLACE_STATUSES, no extras).
  const filters = parseDirectoryFilters(url.searchParams)
  const filterWhere = buildDirectoryWhere(filters)

  const where: Prisma.PlaceListingWhereInput = {
    neighborhoodId: targetNeighborhoodId,
    // filterWhere supplies status (tighter when verifiedOnly).
    ...filterWhere,
    ...(category ? { category } : {}),
    // NOTE: when `q` is set we deliberately DON'T constrain in
    // Prisma — Postgres ILIKE doesn't know أحمد == احمد. Instead
    // we overfetch a wider page and filter in JS via the
    // arabicNormalize helper. Safe at directory scale (per-nbhd,
    // bounded by category + status). If a directory ever grows past
    // ~2k places per nbhd, move to a generated normalized column
    // and reinstate the DB-side filter.
  }

  // openNow is post-filtered in JS (parser-driven). Same for `q`
  // when set (Arabic-aware match). Overfetch when either is active
  // so a normal-sized page survives the trim.
  const needsPostFilter = filters.openNow || q.length > 0
  const dbTake = needsPostFilter ? PAGE_SIZE * 10 : PAGE_SIZE

  const rows = await db.placeListing.findMany({
    where,
    orderBy: buildDirectoryOrderBy(filters),
    take: dbTake,
    include: {
      claimedByUser: {
        select: { id: true, name: true, avatarUrl: true, providerStatus: true },
      },
    },
  })

  // q filter first (cheaper), then openNow, then slice.
  let working = rows
  if (q) {
    working = working.filter(
      (p) => matchesArabic(p.name, q) || matchesArabic(p.addressText, q),
    )
  }
  working = applyOpenNowFilter(working, filters).slice(0, PAGE_SIZE)

  return NextResponse.json({ places: working.map(toPublicPlace) })
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

  // ── Google Places snapshot ────────────────────────────────────
  // If the submitter started from a Google pick, we re-fetch Place
  // Details SERVER-SIDE from the place_id (trusting only the id the
  // client sent, never client-supplied rating/hours) so the stored
  // snapshot is authoritative + attributable. Best-effort: a failed
  // lookup just leaves it a normal LOCAL listing.
  const rawGoogleId = (raw as { googlePlaceId?: unknown }).googlePlaceId
  const googlePlaceId =
    typeof rawGoogleId === 'string' && rawGoogleId.startsWith('places/')
      ? rawGoogleId
      : typeof rawGoogleId === 'string' && rawGoogleId.length > 0 && rawGoogleId.length < 300
        ? rawGoogleId
        : null
  const snap = googlePlaceId ? await placeSnapshot(googlePlaceId) : null

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
      snapchat: v.value.snapchat,
      tiktok: v.value.tiktok,
      x: v.value.x,
      mapUrl: v.value.mapUrl,
      latitude: v.value.latitude,
      longitude: v.value.longitude,
      addressText: v.value.addressText,
      // User-entered hours only. Google's hours live in googleHours
      // (per-day text) + googlePeriods (drives the pill) — we don't
      // squeeze them into the lossy single-schedule string.
      openingHours: v.value.openingHours,
      // Image URLs accepted from the composer. The /api/upload
      // endpoint validates each file's MIME + size BEFORE handing
      // back a URL, so by the time bytes reach this row we just
      // need to cap the array count + reject non-https junk.
      imageUrls: sanitizeImageUrls((raw as { imageUrls?: unknown }).imageUrls),
      status: 'PENDING',
      createdByUserId: user.id,
      // Google provenance + snapshot (LOCAL when no place_id).
      source: snap ? 'GOOGLE' : 'LOCAL',
      googlePlaceId: googlePlaceId,
      googleRating: snap?.rating ?? null,
      googleRatingCount: snap?.ratingCount ?? null,
      googleHours: snap?.hours ?? null,
      googlePeriods:
        snap?.periods && snap.periods.length > 0
          ? (snap.periods as unknown as Prisma.InputJsonValue)
          : undefined,
      googlePhotoRefs: snap?.photoRefs ?? [],
      googleReviews:
        snap?.reviews && snap.reviews.length > 0
          ? (snap.reviews as unknown as Prisma.InputJsonValue)
          : undefined,
      googleSyncedAt: snap ? new Date() : null,
    },
    include: {
      claimedByUser: {
        select: { id: true, name: true, avatarUrl: true, providerStatus: true },
      },
    },
  })

  // ── Owner-claim-on-submit ─────────────────────────────────────
  // If the submitter says "I'm the owner of this place" + provides
  // some proof text, we create a PlaceClaimRequest in the same
  // request so the mod can review BOTH the place AND the claim in
  // one go. Without this, an owner submitting their own business
  // had to file the place, wait for approval, then come back and
  // file a claim separately — two reviews for what's really one
  // decision.
  //
  // Proof text isn't structurally validated server-side beyond
  // length — it's a free-form message for the mod to read ("هذا
  // محل أبي، تواصل معي على نفس رقم الجوال للتأكيد"). Phase 1.5
  // can add evidence image uploads.
  const claimAsOwner = (raw as { claimAsOwner?: unknown }).claimAsOwner === true
  if (claimAsOwner) {
    const proofRaw = (raw as { ownerProof?: unknown }).ownerProof
    const proof = typeof proofRaw === 'string' ? proofRaw.trim().slice(0, 500) : ''
    try {
      await db.placeClaimRequest.create({
        data: {
          placeId: place.id,
          userId: user.id,
          message: proof || null,
        },
        select: { id: true },
      })
    } catch (err) {
      // Don't fail the whole submission if the claim insert errors
      // (e.g. the user already has too many open claims). The place
      // is created; user can file the claim manually later.
      console.error('[POST /api/directory] claim-on-submit failed:', err)
    }
  }

  return NextResponse.json({
    ok: true,
    place: toPublicPlace(place),
    claimSubmitted: claimAsOwner,
  })
}

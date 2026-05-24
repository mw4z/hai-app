import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { cacheDelete } from '@/lib/cache'
import { verifyNeighborhoodAssignment } from '@/lib/location/verify'
import { isValidFirstName, isValidLastName, normalizeName } from '@/lib/nameValidation'

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const body = await req.json()
    const {
      name,
      lastName,
      gender,
      accountType,
      neighborhoodId,
      verifyLat,
      verifyLng,
      verifyAccuracy,
    } = body as {
      name?: string
      lastName?: string
      gender?: string
      accountType?: string
      neighborhoodId?: string
      verifyLat?: number
      verifyLng?: number
      verifyAccuracy?: number
    }

    // Normalize Unicode (NFKC) + strip zero-width chars + trim. Pure
    // helpers from nameValidation.ts so the same rules apply to the
    // CHECK constraint check, the route handler, and the unit tests.
    // Was: ad-hoc `.trim()` only — let invisible zero-width chars
    // bypass the length floor (a "1-char" first name padded with U+200B
    // would have read as 2 chars, persisted, then rendered as 1).
    const normalizedName = normalizeName(name)
    const normalizedLastName = normalizeName(lastName)
    if (!isValidFirstName(normalizedName)) {
      return NextResponse.json(
        { error: 'INVALID_NAME', message: 'الاسم الأول مطلوب (حرفين على الأقل)' },
        { status: 400 },
      )
    }
    // lastName is optional — single-letter initials accepted, empty
    // normalized strings become NULL at write time below.
    if (!isValidLastName(normalizedLastName)) {
      return NextResponse.json(
        { error: 'INVALID_LAST_NAME', message: 'اسم العائلة غير صالح' },
        { status: 400 },
      )
    }
    if (!gender || !neighborhoodId) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })
    }

    const validAccountType = ['NORMAL', 'SERVICE_PROVIDER'].includes(
      accountType || '',
    )
      ? (accountType as 'NORMAL' | 'SERVICE_PROVIDER')
      : 'NORMAL'

    // Fetch the full neighborhood row (with polygon + centroid) for verification
    const neighborhood = await db.neighborhood.findUnique({
      where: { id: neighborhoodId },
      select: {
        id: true,
        hidden: true,
        name: true,
        lat: true,
        lng: true,
        boundary: true,
        bbox: true,
        city: { select: { name: true } },
      },
    })
    if (!neighborhood || neighborhood.hidden) {
      return NextResponse.json({ error: 'الحي غير موجود' }, { status: 404 })
    }

    // ── Server-side assignment verification ────────────────────────────
    // If the client sent coordinates (normal flow), re-check that the
    // claimed neighborhood is either:
    //   (a) the polygon the user is physically inside, or
    //   (b) within the fallback radius when GPS was low-accuracy
    // This prevents a bypassed client from assigning an arbitrary
    // neighborhood the user is nowhere near.
    let addressVerified = false
    if (
      typeof verifyLat === 'number' &&
      typeof verifyLng === 'number' &&
      Number.isFinite(verifyLat) &&
      Number.isFinite(verifyLng)
    ) {
      const accuracy =
        typeof verifyAccuracy === 'number' && verifyAccuracy > 0
          ? verifyAccuracy
          : 9999
      const verdict = verifyNeighborhoodAssignment(
        verifyLat,
        verifyLng,
        accuracy,
        neighborhood,
      )
      if (verdict === 'rejected') {
        // Coords didn't confirm the chosen neighborhood — but the user is
        // ALLOWED to claim it as home (CLAIMED_RESIDENT, limited rights
        // until verified by GPS or a mod). This is the "choose your
        // neighborhood even while outside it" path: we DON'T block, we
        // just leave addressVerified=false so membership becomes CLAIMED.
        // (Don't log lat/lng — it's the user's precise location.)
        console.log('[COMPLETE_PROFILE] coords did not confirm — linking as claimed', {
          userId: session.userId,
          neighborhoodId,
          accuracy,
        })
        // addressVerified stays false → CLAIMED_RESIDENT below.
      } else {
        addressVerified = true
        console.log('[COMPLETE_PROFILE] neighborhood verify ok', {
          userId: session.userId,
          neighborhoodId,
          verdict,
        })
      }
    } else {
      // Legacy clients / re-runs without coordinates: allow (existence
      // check still applies) but do NOT mark addressVerified true.
      console.log('[COMPLETE_PROFILE] no verify coordinates — skipping check', {
        userId: session.userId,
        neighborhoodId,
      })
    }

    // Onboarding users who picked SERVICE_PROVIDER haven't written a service
    // description yet — land them in PENDING. Pre-populate address + coords
    // from their own neighborhood so when they add a description later, the
    // quality gate can auto-flip them to ACTIVE. (Service location is always
    // the user's neighborhood — never user-chosen.)
    const isProvider = validAccountType === 'SERVICE_PROVIDER'
    const providerStatus = isProvider ? 'PENDING' : 'NONE'
    const providerFields = isProvider
      ? {
          serviceAddress: `${neighborhood.name}, ${neighborhood.city.name}`,
          serviceLat: neighborhood.lat,
          serviceLng: neighborhood.lng,
        }
      : {}

    // Membership: GPS-verified → VERIFIED_RESIDENT; manual pick while
    // outside → CLAIMED_RESIDENT (limited rights until verified). Mirror
    // is kept so addressVerified ⟺ VERIFIED_RESIDENT.
    const membership = addressVerified ? 'VERIFIED_RESIDENT' : 'CLAIMED_RESIDENT'

    await db.user.update({
      where: { id: session.userId },
      data: {
        name: normalizedName,
        lastName: normalizedLastName || null,
        gender: gender as any,
        accountType: validAccountType,
        providerStatus,
        neighborhoodId,
        addressVerified,
        membership,
        ...(addressVerified ? {} : { homeClaimedAt: new Date() }),
        ...providerFields,
      },
    })

    // Queue a claimed resident for mod review (so they can be upgraded to
    // verified). Skip if already verified.
    if (!addressVerified) {
      await db.neighborhoodClaim.create({
        data: { userId: session.userId, neighborhoodId, status: 'PENDING', note: 'onboarding' },
      }).catch(() => { /* non-fatal: queue entry is best-effort */ })
    }

    cacheDelete(`user:${session.userId}`)

    return NextResponse.json({ success: true, addressVerified, membership })
  } catch (error) {
    console.error('complete-profile error:', error)
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

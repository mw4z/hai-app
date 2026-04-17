import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { cacheDelete } from '@/lib/cache'
import { verifyNeighborhoodAssignment } from '@/lib/location/verify'

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

    if (!name || !gender || !neighborhoodId) {
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
        lat: true,
        lng: true,
        boundary: true,
        bbox: true,
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
        console.warn('[COMPLETE_PROFILE] neighborhood verify rejected', {
          userId: session.userId,
          neighborhoodId,
          lat: verifyLat,
          lng: verifyLng,
          accuracy,
        })
        return NextResponse.json(
          {
            error: 'neighborhood_mismatch',
            message: 'الحي لا يتطابق مع موقعك',
          },
          { status: 403 },
        )
      }
      addressVerified = true
      console.log('[COMPLETE_PROFILE] neighborhood verify ok', {
        userId: session.userId,
        neighborhoodId,
        verdict,
      })
    } else {
      // Legacy clients / re-runs without coordinates: allow (existence
      // check still applies) but do NOT mark addressVerified true.
      console.log('[COMPLETE_PROFILE] no verify coordinates — skipping check', {
        userId: session.userId,
        neighborhoodId,
      })
    }

    // Onboarding users who picked SERVICE_PROVIDER haven't filled the service
    // fields yet — put them in PENDING so they're not visible publicly until
    // they complete their profile (description + location + address).
    const providerStatus = validAccountType === 'SERVICE_PROVIDER' ? 'PENDING' : 'NONE'

    await db.user.update({
      where: { id: session.userId },
      data: {
        name,
        lastName: lastName?.trim() || null,
        gender: gender as any,
        accountType: validAccountType,
        providerStatus,
        neighborhoodId,
        addressVerified,
      },
    })

    cacheDelete(`user:${session.userId}`)

    return NextResponse.json({ success: true, addressVerified })
  } catch (error) {
    console.error('complete-profile error:', error)
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

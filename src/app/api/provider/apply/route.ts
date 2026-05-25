import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getValidatedSession as getSession } from '@/lib/auth-server'
import { log } from '@/lib/logger'
import { computeProviderStatus, isValidCoord, providerCooldownRemainingMs } from '@/lib/provider'
import { ensureProviderListing } from '@/lib/services/ensureProviderListing'

/**
 * POST /api/provider/apply
 * Promotes a NORMAL user to SERVICE_PROVIDER. The service location is always
 * the user's own registered neighborhood — not user-chosen — so the body only
 * needs a description. Address + centroid coords are derived from the
 * Neighborhood record server-side.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        accountType: true,
        providerStatusChangedAt: true,
        neighborhood: {
          select: { name: true, nameEn: true, lat: true, lng: true, city: { select: { name: true, nameEn: true } } },
        },
      },
    })
    if (!user) {
      return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
    }
    if (user.accountType !== 'NORMAL') {
      return NextResponse.json(
        { error: 'already_provider', message: 'حسابك مقدم خدمة بالفعل' },
        { status: 400 },
      )
    }
    const cooldownLeft = providerCooldownRemainingMs(user.providerStatusChangedAt)
    if (cooldownLeft > 0) {
      const hoursLeft = Math.ceil(cooldownLeft / 3_600_000)
      return NextResponse.json(
        {
          error: 'cooldown_active',
          message: `يمكنك تغيير حالة مقدم الخدمة بعد ${hoursLeft} ساعة`,
          remainingMs: cooldownLeft,
        },
        { status: 429 },
      )
    }
    if (!user.neighborhood) {
      return NextResponse.json(
        { error: 'no_neighborhood', message: 'يجب تحديد الحي أولاً' },
        { status: 400 },
      )
    }
    if (!isValidCoord(user.neighborhood.lat, user.neighborhood.lng)) {
      return NextResponse.json(
        { error: 'neighborhood_missing_coords', message: 'الحي لا يحتوي على إحداثيات صالحة' },
        { status: 500 },
      )
    }

    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const serviceDescription = typeof body.serviceDescription === 'string' ? body.serviceDescription.trim() : ''
    if (!serviceDescription) {
      return NextResponse.json(
        { error: 'service_description_required', message: 'اشرح خدمتك' },
        { status: 400 },
      )
    }
    if (serviceDescription.length > 500) {
      return NextResponse.json(
        { error: 'service_description_too_long', message: 'وصف الخدمة طويل جداً (500 حرف كحد أقصى)' },
        { status: 400 },
      )
    }

    // Service location = user's own neighborhood (label + centroid). Locked.
    const serviceAddress = `${user.neighborhood.name}, ${user.neighborhood.city.name}`
    const serviceLat = user.neighborhood.lat!
    const serviceLng = user.neighborhood.lng!

    const providerStatus = computeProviderStatus({
      serviceDescription,
      serviceAddress,
      serviceLat,
      serviceLng,
    })

    const updated = await db.user.update({
      where: { id: session.userId },
      data: {
        accountType: 'SERVICE_PROVIDER',
        providerStatus,
        providerStatusChangedAt: new Date(),
        serviceDescription,
        serviceAddress,
        serviceLat,
        serviceLng,
      },
      select: {
        accountType: true,
        providerStatus: true,
        serviceDescription: true,
        serviceAddress: true,
        serviceLat: true,
        serviceLng: true,
      },
    })

    log.api('POST', '/api/provider/apply', session.userId)
    // Auto-list newly active/verified providers in the directory (idempotent).
    if (updated.providerStatus === 'ACTIVE' || updated.providerStatus === 'VERIFIED') {
      void ensureProviderListing(session.userId)
    }
    return NextResponse.json({ success: true, user: updated })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/provider/apply POST' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

/**
 * DELETE /api/provider/apply
 * Reverts a SERVICE_PROVIDER (PENDING or ACTIVE) back to NORMAL. Clears the
 * service profile fields and auto-revokes any pending verification request.
 * VERIFIED_PROVIDER is admin-controlled and cannot self-demote via this route.
 * Catalog items (ServiceItem) are intentionally kept — they're simply hidden
 * from public listings while providerStatus=NONE, and become visible again
 * if the user re-applies.
 */
export async function DELETE() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { accountType: true, providerStatus: true, providerStatusChangedAt: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'المستخدم غير موجود' }, { status: 404 })
    }
    if (user.accountType === 'NORMAL') {
      return NextResponse.json(
        { error: 'not_a_provider', message: 'لست مقدم خدمة' },
        { status: 400 },
      )
    }
    if (user.accountType === 'VERIFIED_PROVIDER') {
      return NextResponse.json(
        { error: 'verified_cannot_self_demote', message: 'الحسابات الموثّقة لا يمكن إلغاؤها ذاتياً' },
        { status: 400 },
      )
    }
    const cooldownLeft = providerCooldownRemainingMs(user.providerStatusChangedAt)
    if (cooldownLeft > 0) {
      const hoursLeft = Math.ceil(cooldownLeft / 3_600_000)
      return NextResponse.json(
        {
          error: 'cooldown_active',
          message: `يمكنك تغيير حالة مقدم الخدمة بعد ${hoursLeft} ساعة`,
          remainingMs: cooldownLeft,
        },
        { status: 429 },
      )
    }

    await db.$transaction([
      db.user.update({
        where: { id: session.userId },
        data: {
          accountType: 'NORMAL',
          providerStatus: 'NONE',
          providerStatusChangedAt: new Date(),
          serviceDescription: null,
          serviceAddress: null,
          serviceLat: null,
          serviceLng: null,
        },
      }),
      // Auto-revoke any pending verification request so it doesn't sit in the
      // admin queue for a user who is no longer a provider.
      db.verificationRequest.updateMany({
        where: { userId: session.userId, status: 'pending' },
        data: { status: 'revoked' },
      }),
    ])

    log.api('DELETE', '/api/provider/apply', session.userId)
    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/provider/apply DELETE' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

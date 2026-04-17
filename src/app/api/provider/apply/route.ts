import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getValidatedSession as getSession } from '@/lib/auth-server'
import { log } from '@/lib/logger'
import { computeProviderStatus, isValidCoord } from '@/lib/provider'

/**
 * POST /api/provider/apply
 * Turns a NORMAL user into a SERVICE_PROVIDER. providerStatus starts at
 * PENDING and auto-promotes to ACTIVE when the submitted fields pass the
 * quality gate (description ≥ 20 chars, valid lat/lng, non-empty address).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { accountType: true, providerStatus: true },
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

    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const serviceDescription = typeof body.serviceDescription === 'string' ? body.serviceDescription.trim() : ''
    const serviceAddress = typeof body.serviceAddress === 'string' ? body.serviceAddress.trim() : ''
    const serviceLat = typeof body.serviceLat === 'number' ? body.serviceLat : Number(body.serviceLat)
    const serviceLng = typeof body.serviceLng === 'number' ? body.serviceLng : Number(body.serviceLng)

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
    if (!serviceAddress) {
      return NextResponse.json(
        { error: 'service_address_required', message: 'عنوان الخدمة مطلوب' },
        { status: 400 },
      )
    }
    if (!isValidCoord(serviceLat, serviceLng)) {
      return NextResponse.json(
        { error: 'service_location_required', message: 'موقع الخدمة مطلوب (إحداثيات غير صالحة)' },
        { status: 400 },
      )
    }

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
    return NextResponse.json({ success: true, user: updated })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/provider/apply POST' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

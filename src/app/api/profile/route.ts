import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getValidatedSession as getSession } from '@/lib/auth-server'
import { log } from '@/lib/logger'
import { computeProviderStatus } from '@/lib/provider'
import { sanitizeSocialLinks } from '@/lib/socialLinks'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    log.api('GET', '/api/profile', session.userId)

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: {
        name: true,
        lastName: true,
        phone: true,
        gender: true,
        reputation: true,
        avatarUrl: true,
        email: true,
        emailVerified: true,
        accountType: true,
        providerStatus: true,
        bio: true,
        serviceDescription: true,
        serviceLat: true,
        serviceLng: true,
        serviceAddress: true,
        socialLinks: true,
        role: true,
        neighborhoodId: true,
        // Neighborhood center — used as the "near me" search bias for the
        // rides location picker (so place suggestions start from nearest).
        neighborhood: { select: { lat: true, lng: true } },
      },
    })

    return NextResponse.json(user)
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/profile GET' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    log.api('PATCH', '/api/profile', session.userId)

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
    const { name, lastName, avatar, email } = body

    // Build update data object with only provided fields
    const data: Record<string, unknown> = {}

    if (name !== undefined) {
      if (!name?.trim()) return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 })
      data.name = name.trim()
    }

    if (lastName !== undefined) {
      data.lastName = lastName?.trim() || null
    }

    if (avatar !== undefined) {
      data.avatarUrl = avatar
    }

    if (body.cover !== undefined) {
      data.coverUrl = body.cover
    }

    if (email !== undefined) {
      data.email = email
    }

    // Bio — max 300 chars
    if (body.bio !== undefined) {
      const bio = typeof body.bio === 'string' ? body.bio.trim() : ''
      if (bio.length > 300) return NextResponse.json({ error: 'النبذة طويلة جداً (300 حرف كحد أقصى)' }, { status: 400 })
      data.bio = bio || null
    }

    // Service description — only for service providers (max 500 chars).
    // Address + coordinates are NOT user-editable — they are locked to the
    // user's own neighborhood and set by /api/provider/apply. Any
    // serviceAddress / serviceLat / serviceLng in the body is ignored.
    if (body.serviceDescription !== undefined) {
      const desc = typeof body.serviceDescription === 'string' ? body.serviceDescription.trim() : ''
      if (desc.length > 500) return NextResponse.json({ error: 'وصف الخدمة طويل جداً (500 حرف كحد أقصى)' }, { status: 400 })
      data.serviceDescription = desc || null
    }

    // Social links — service providers only. Silently validate each
    // platform's handle; invalid entries drop from the set instead of
    // failing the whole request. Empty object => explicit clear.
    if (body.socialLinks !== undefined) {
      const gate = await db.user.findUnique({
        where: { id: session.userId },
        select: { accountType: true, providerStatus: true },
      })
      const isProvider = gate?.accountType === 'SERVICE_PROVIDER' &&
        (gate.providerStatus === 'ACTIVE' || gate.providerStatus === 'VERIFIED' || gate.providerStatus === 'PENDING')
      if (!isProvider) {
        return NextResponse.json({ error: 'متاح فقط لمقدمي الخدمات' }, { status: 403 })
      }
      const clean = sanitizeSocialLinks(body.socialLinks)
      data.socialLinks = Object.keys(clean).length > 0 ? clean : null
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'لا يوجد بيانات للتحديث' }, { status: 400 })
    }

    // If any service field was touched, recompute providerStatus so the
    // lifecycle (PENDING ↔ ACTIVE) stays consistent with the quality gate
    // enforced by /api/provider/apply. VERIFIED_PROVIDER is admin-controlled
    // and deliberately left untouched; NORMAL users can't have service fields
    // change their status because we only flip it for SERVICE_PROVIDER.
    // Address/coords are locked to the user's neighborhood, so the only
    // PATCH-mutable field that affects providerStatus is the description.
    const touchedServiceFields = data.serviceDescription !== undefined

    if (touchedServiceFields) {
      const current = await db.user.findUnique({
        where: { id: session.userId },
        select: {
          accountType: true,
          serviceDescription: true,
          serviceAddress: true,
          serviceLat: true,
          serviceLng: true,
        },
      })
      if (current?.accountType === 'SERVICE_PROVIDER') {
        // `undefined` means "not sent in this PATCH" (keep current);
        // `null` means "user cleared the field" (honor the clear).
        const pick = <T,>(next: unknown, prev: T | null): T | null =>
          next === undefined ? prev : (next as T | null)
        const merged = {
          serviceDescription: pick<string>(data.serviceDescription, current.serviceDescription),
          serviceAddress:     pick<string>(data.serviceAddress,     current.serviceAddress),
          serviceLat:         pick<number>(data.serviceLat,         current.serviceLat),
          serviceLng:         pick<number>(data.serviceLng,         current.serviceLng),
        }
        data.providerStatus = computeProviderStatus(merged)
      }
    }

    const updated = await db.user.update({
      where: { id: session.userId },
      data,
      select: {
        accountType: true,
        providerStatus: true,
        serviceDescription: true,
        serviceAddress: true,
        serviceLat: true,
        serviceLng: true,
        socialLinks: true,
        bio: true,
      },
    })

    return NextResponse.json({ success: true, user: updated })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/profile PATCH' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

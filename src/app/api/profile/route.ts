import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getValidatedSession as getSession } from '@/lib/auth-server'
import { log } from '@/lib/logger'

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
        bio: true,
        serviceDescription: true,
        serviceLat: true,
        serviceLng: true,
        serviceAddress: true,
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

    // Service description — only for service providers (max 500 chars)
    if (body.serviceDescription !== undefined) {
      const desc = typeof body.serviceDescription === 'string' ? body.serviceDescription.trim() : ''
      if (desc.length > 500) return NextResponse.json({ error: 'وصف الخدمة طويل جداً (500 حرف كحد أقصى)' }, { status: 400 })
      data.serviceDescription = desc || null
    }

    // Service location — optional lat/lng/address
    if (body.serviceAddress !== undefined) {
      data.serviceAddress = typeof body.serviceAddress === 'string' ? body.serviceAddress.trim() || null : null
    }
    if (body.serviceLat !== undefined && body.serviceLng !== undefined) {
      const lat = Number(body.serviceLat)
      const lng = Number(body.serviceLng)
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        data.serviceLat = lat
        data.serviceLng = lng
      } else {
        // Clear location if invalid
        data.serviceLat = null
        data.serviceLng = null
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'لا يوجد بيانات للتحديث' }, { status: 400 })
    }

    await db.user.update({
      where: { id: session.userId },
      data,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/profile PATCH' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

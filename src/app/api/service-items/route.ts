import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { log } from '@/lib/logger'
import { getLimits } from '@/lib/capabilities'

/** GET — get service items for a user (hidden if the provider isn't publicly visible) */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    // Only expose the catalog when the provider has cleared the status gate.
    // Pending/NONE providers' items stay invisible to the public.
    const owner = await db.user.findUnique({
      where: { id: userId },
      select: { providerStatus: true },
    })
    if (!owner || (owner.providerStatus !== 'ACTIVE' && owner.providerStatus !== 'VERIFIED')) {
      return NextResponse.json([])
    }

    // Public surface: only items the owner has explicitly chosen
    // to expose on their profile. The catalog editor for the
    // owner uses /api/service-items/mine which returns every
    // item regardless of these flags.
    const items = await db.serviceItem.findMany({
      where: { userId, active: true, showOnProfile: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, title: true, description: true, price: true, imageUrl: true },
    })

    return NextResponse.json(items)
  } catch (error) {
    log.error('Service items GET failed', error, { route: '/api/service-items' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

/** POST — add a service item (providers only) */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', '/api/service-items', session.userId)

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { accountType: true, plan: true },
    })
    if (!user || (user.accountType !== 'SERVICE_PROVIDER' && user.accountType !== 'VERIFIED_PROVIDER')) {
      return NextResponse.json({ error: 'متاح فقط لمقدمي الخدمات / Service providers only' }, { status: 403 })
    }

    const limits = getLimits(user.plan)
    const count = await db.serviceItem.count({ where: { userId: session.userId } })
    if (count >= limits.catalogItems) {
      return NextResponse.json({ error: 'وصلت الحد الأقصى للعناصر حالياً / Item limit reached for now' }, { status: 400 })
    }

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

    const { title, description, price, imageUrl } = body
    if (!title?.trim() || title.trim().length < 2) {
      return NextResponse.json({ error: 'العنوان مطلوب / Title required' }, { status: 400 })
    }
    if (title.trim().length > 80) {
      return NextResponse.json({ error: 'العنوان طويل جداً / Title too long' }, { status: 400 })
    }
    if (description && description.length > 300) {
      return NextResponse.json({ error: 'الوصف طويل جداً / Description too long' }, { status: 400 })
    }
    if (price !== undefined && price !== null && (typeof price !== 'number' || price < 0 || price > 100000)) {
      return NextResponse.json({ error: 'سعر غير صالح / Invalid price' }, { status: 400 })
    }

    const item = await db.serviceItem.create({
      data: {
        userId: session.userId,
        title: title.trim(),
        description: description?.trim() || null,
        price: price ?? null,
        imageUrl: imageUrl || null,
        sortOrder: count,
      },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    log.error('Service item create failed', error, { route: '/api/service-items' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

/** PATCH — update a service item */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

    const { id, title, description, price, imageUrl, active, showOnProfile, showOnPlace } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const item = await db.serviceItem.findUnique({ where: { id }, select: { userId: true } })
    if (!item || item.userId !== session.userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const data: Record<string, any> = {}
    if (title !== undefined) {
      if (!title?.trim() || title.trim().length < 2) return NextResponse.json({ error: 'Title required' }, { status: 400 })
      data.title = title.trim()
    }
    if (description !== undefined) data.description = description?.trim() || null
    if (price !== undefined) data.price = price
    if (imageUrl !== undefined) data.imageUrl = imageUrl || null
    if (typeof active === 'boolean') data.active = active
    // Visibility flags — boolean only. Owner toggles where each
    // item appears (public profile / claimed place / both).
    if (typeof showOnProfile === 'boolean') data.showOnProfile = showOnProfile
    if (typeof showOnPlace === 'boolean') data.showOnPlace = showOnPlace

    await db.serviceItem.update({ where: { id }, data })
    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('Service item update failed', error, { route: '/api/service-items PATCH' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

/** DELETE — remove a service item */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const item = await db.serviceItem.findUnique({ where: { id }, select: { userId: true } })
    if (!item || item.userId !== session.userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await db.serviceItem.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('Service item delete failed', error, { route: '/api/service-items DELETE' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

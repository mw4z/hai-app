import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { cacheDelete } from '@/lib/cache'

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const { name, lastName, gender, accountType, neighborhoodId } = await req.json()

    if (!name || !gender || !neighborhoodId) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })
    }

    const validAccountType = ['NORMAL', 'SERVICE_PROVIDER'].includes(accountType) ? accountType : 'NORMAL'

    // Verify neighborhood exists
    const neighborhood = await db.neighborhood.findUnique({
      where: { id: neighborhoodId },
    })
    if (!neighborhood) {
      return NextResponse.json({ error: 'الحي غير موجود' }, { status: 404 })
    }

    await db.user.update({
      where: { id: session.userId },
      data: { name, lastName: lastName?.trim() || null, gender, accountType: validAccountType, neighborhoodId },
    })

    // Invalidate user cache
    cacheDelete(`user:${session.userId}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('complete-profile error:', error)
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { log } from '@/lib/logger'

const VALID_TYPES = ['complaint', 'suggestion', 'issue', 'other']

/** POST — Submit a report to neighborhood admin */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', '/api/neighborhood-report', session.userId)

    const user = await db.user.findUnique({ where: { id: session.userId }, select: { name: true, neighborhoodId: true } })
    if (!user?.neighborhoodId) return NextResponse.json({ error: 'يجب أن تكون مسجلاً في حي' }, { status: 400 })

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
    const { type, subject, body: reportBody, imageUrls } = body

    if (!type || !VALID_TYPES.includes(type)) return NextResponse.json({ error: 'نوع غير صالح' }, { status: 400 })
    if (!subject?.trim() || subject.trim().length < 3) return NextResponse.json({ error: 'الموضوع قصير جداً' }, { status: 400 })
    if (!reportBody?.trim() || reportBody.trim().length < 10) return NextResponse.json({ error: 'الوصف قصير جداً' }, { status: 400 })

    // Max 5 open reports
    const openCount = await db.neighborhoodReport.count({ where: { userId: session.userId, status: { in: ['open', 'reviewed'] } } })
    if (openCount >= 5) return NextResponse.json({ error: 'لديك بلاغات مفتوحة كثيرة' }, { status: 429 })

    const report = await db.neighborhoodReport.create({
      data: {
        userId: session.userId,
        neighborhoodId: user.neighborhoodId,
        type, subject: subject.trim(), body: reportBody.trim(),
        imageUrls: Array.isArray(imageUrls) ? imageUrls.slice(0, 3) : [],
      },
    })

    // Notify neighborhood mods + super admins
    const admins = await db.user.findMany({
      where: { OR: [{ neighborhoodId: user.neighborhoodId, role: 'NEIGHBORHOOD_MOD' }, { role: 'SUPER_ADMIN' }], status: 'ACTIVE' },
      select: { id: true },
    })
    const emojiMap: Record<string, string> = { complaint: '⚠️', suggestion: '💡', issue: '🔧', other: '📝' }
    const typeEmoji = emojiMap[type] || '📝'
    for (const admin of admins) {
      await db.notification.create({
        data: {
          userId: admin.id, type: 'SYSTEM', actorId: session.userId, actorName: user.name,
          title: `${typeEmoji} بلاغ حي جديد`, titleEn: `${typeEmoji} New neighborhood report`,
          body: subject.trim(), bodyEn: subject.trim(),
        },
      })
    }

    return NextResponse.json({ id: report.id }, { status: 201 })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/neighborhood-report POST' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

/** GET — Get user's reports */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('GET', '/api/neighborhood-report', session.userId)

    const reports = await db.neighborhoodReport.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return NextResponse.json(reports)
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/neighborhood-report GET' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

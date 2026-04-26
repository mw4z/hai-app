import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { log } from '@/lib/logger'
import { sendEmail } from '@/lib/email'

const VALID_TYPES = ['bug', 'feature', 'complaint', 'other']
const MAX_OPEN_TICKETS = 5

/** POST — Create a support ticket */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', '/api/support', session.userId)

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
    const { type, subject, body: ticketBody, imageUrls } = body

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'نوع التذكرة غير صالح' }, { status: 400 })
    }
    if (!subject?.trim() || subject.trim().length < 3) {
      return NextResponse.json({ error: 'الموضوع قصير جداً' }, { status: 400 })
    }
    if (!ticketBody?.trim() || ticketBody.trim().length < 10) {
      return NextResponse.json({ error: 'الوصف قصير جداً (10 أحرف على الأقل)' }, { status: 400 })
    }
    if (subject.length > 100) {
      return NextResponse.json({ error: 'الموضوع طويل جداً' }, { status: 400 })
    }
    if (ticketBody.length > 1000) {
      return NextResponse.json({ error: 'الوصف طويل جداً' }, { status: 400 })
    }

    // Limit open tickets
    const openCount = await db.supportTicket.count({
      where: { userId: session.userId, status: { in: ['open', 'in_progress'] } },
    })
    if (openCount >= MAX_OPEN_TICKETS) {
      return NextResponse.json({ error: 'لديك تذاكر مفتوحة كثيرة — انتظر حتى يتم الرد عليها' }, { status: 429 })
    }

    const user = await db.user.findUnique({ where: { id: session.userId }, select: { name: true, lastName: true } })
    const userFullName = [user?.name?.trim(), user?.lastName?.trim()].filter(Boolean).join(' ') || user?.name || null

    const ticket = await db.supportTicket.create({
      data: {
        userId: session.userId,
        type,
        subject: subject.trim(),
        body: ticketBody.trim(),
        imageUrls: Array.isArray(imageUrls) ? imageUrls.slice(0, 3) : [],
      },
    })

    // Notify all super admins
    const typeLabel = ({ bug: '🐛', feature: '💡', complaint: '⚠️', other: '📝' } as Record<string, string>)[type] || '📝'
    const typeNameAr = ({ bug: 'خلل تقني', feature: 'اقتراح', complaint: 'شكوى', other: 'أخرى' } as Record<string, string>)[type] || 'أخرى'
    const admins = await db.user.findMany({ where: { role: 'SUPER_ADMIN' }, select: { id: true } })
    for (const admin of admins) {
      await db.notification.create({
        data: {
          userId: admin.id,
          type: 'SYSTEM',
          actorId: session.userId,
          actorName: userFullName,
          title: `${typeLabel} تذكرة دعم جديدة`,
          titleEn: `${typeLabel} New support ticket`,
          body: subject.trim(),
          bodyEn: subject.trim(),
        },
      })
    }

    // Send email to support@hai-app.net
    sendEmail({
      to: 'support@hai-app.net',
      subject: `${typeLabel} تذكرة دعم جديدة: ${subject.trim()}`,
      text: `تذكرة دعم جديدة\n\nالمستخدم: ${userFullName || 'غير معروف'}\nالنوع: ${typeNameAr}\nالموضوع: ${subject.trim()}\n\n${ticketBody.trim()}\n\n---\nرقم التذكرة: ${ticket.id}`,
      html: `
        <div dir="rtl" style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #006d57; color: white; padding: 16px 24px; border-radius: 12px 12px 0 0; text-align: center;">
            <h2 style="margin: 0;">${typeLabel} تذكرة دعم جديدة</h2>
          </div>
          <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <table style="width: 100%; font-size: 14px; color: #374151; margin-bottom: 16px;">
              <tr><td style="padding: 4px 0; font-weight: bold;">المستخدم:</td><td>${userFullName || 'غير معروف'}</td></tr>
              <tr><td style="padding: 4px 0; font-weight: bold;">النوع:</td><td>${typeNameAr}</td></tr>
              <tr><td style="padding: 4px 0; font-weight: bold;">الموضوع:</td><td>${subject.trim()}</td></tr>
            </table>
            <div style="background: white; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; color: #1f2937; line-height: 1.7;">
              ${ticketBody.trim().replace(/\n/g, '<br>')}
            </div>
            ${ticket.imageUrls.length > 0 ? `
              <div style="margin-top: 16px;">
                <p style="font-weight: bold; color: #374151; margin-bottom: 8px;">المرفقات (${ticket.imageUrls.length}):</p>
                ${ticket.imageUrls.map((url: string, i: number) => {
                  const fullUrl = url.startsWith('http') ? url : `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}${url}`
                  return `<a href="${fullUrl}" style="display: inline-block; margin: 4px;"><img src="${fullUrl}" alt="مرفق ${i + 1}" style="max-width: 200px; max-height: 200px; border-radius: 8px; border: 1px solid #e5e7eb;"></a>`
                }).join('')}
              </div>
            ` : ''}
            <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">رقم التذكرة: ${ticket.id}</p>
          </div>
        </div>
      `,
    }).catch(() => {})

    return NextResponse.json({ id: ticket.id }, { status: 201 })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/support POST' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

/** GET — Get user's tickets */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('GET', '/api/support', session.userId)

    const tickets = await db.supportTicket.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return NextResponse.json(tickets)
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/support GET' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

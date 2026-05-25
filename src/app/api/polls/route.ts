import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

const ADMIN_ROLES = ['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD']

/** POST — Create a poll (admin only) */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, neighborhoodId: true },
  })
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'التصويت متاح فقط للمشرفين' }, { status: 403 })
  }
  if (!user.neighborhoodId) {
    return NextResponse.json({ error: 'يجب أن تكون مسجلاً في حي' }, { status: 400 })
  }

  const { question, options, expiresAt } = await req.json()

  if (!question?.trim() || question.trim().length < 5) {
    return NextResponse.json({ error: 'السؤال قصير جداً' }, { status: 400 })
  }
  if (!Array.isArray(options) || options.length < 2 || options.length > 6) {
    return NextResponse.json({ error: 'يجب أن يكون هناك 2-6 خيارات' }, { status: 400 })
  }
  const cleanOptions = options.map((o: string) => o?.trim()).filter(Boolean)
  if (cleanOptions.length < 2) {
    return NextResponse.json({ error: 'الخيارات فارغة' }, { status: 400 })
  }

  const poll = await db.poll.create({
    data: {
      question: question.trim(),
      options: cleanOptions,
      authorId: session.userId,
      neighborhoodId: user.neighborhoodId,
      // Polls auto-expire 48h after creation (closed by the expire-polls
      // sweep in the notif cron), unless an explicit expiresAt is passed.
      expiresAt: expiresAt ? new Date(expiresAt) : new Date(Date.now() + 48 * 60 * 60 * 1000),
    },
  })

  return NextResponse.json({ id: poll.id }, { status: 201 })
}

/** GET — List polls for current neighborhood */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { neighborhoodId: true },
  })

  const { searchParams } = new URL(req.url)
  const neighborhoodId = searchParams.get('neighborhood') || user?.neighborhoodId

  const polls = await db.poll.findMany({
    where: {
      neighborhoodId: neighborhoodId || undefined,
      // Active + recently-closed (shown 4h after expiry, then hidden).
      OR: [
        { status: 'active' },
        { status: 'closed', expiresAt: { gt: new Date(Date.now() - 4 * 60 * 60 * 1000) } },
      ],
    },
    include: {
      author: { select: { id: true, name: true, lastName: true, avatarUrl: true, role: true } },
      votes: { select: { userId: true, optionIndex: true } },
      reactions: { select: { userId: true, emoji: true } },
      _count: { select: { votes: true, comments: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  return NextResponse.json(polls)
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { apiError } from '@/lib/validation'
import { isSquareAdminRole } from '@/lib/square/isSquareAdmin'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { detectSquareIntent } from '@/lib/square/detectIntent'
import { checkSquareReplyRateLimit } from '@/lib/square/rateLimit'
import { serializeSquareReply, type PublicSquareReply } from '@/lib/square/serializeThread'

const PAGE_SIZE = 30
const REPLY_MIN = 2
const REPLY_MAX = 2000

interface Params { params: Promise<{ id: string }> }

/** GET /api/square/[id]/replies — paginated reply list (oldest first). */
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return NextResponse.json(apiError('Not found', 404), { status: 404 })
  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!me?.neighborhoodId) return NextResponse.json(apiError('Not found', 404), { status: 404 })
  if (!isSquareAdminRole(me.role)) {
    return NextResponse.json(apiError('Not found', 404), { status: 404 })
  }

  const { id: threadId } = await params
  const thread = await db.squareThread.findUnique({
    where: { id: threadId },
    select: { id: true, neighborhoodId: true },
  })
  if (!thread) return NextResponse.json(apiError('Not found', 404), { status: 404 })
  if (thread.neighborhoodId !== me.neighborhoodId && me.role !== 'PLATFORM_MOD' && me.role !== 'SUPER_ADMIN') {
    return NextResponse.json(apiError('Not found', 404), { status: 404 })
  }

  const url = new URL(req.url)
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0)

  const rows = await db.squareReply.findMany({
    where: { threadId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    skip: offset,
    take: PAGE_SIZE + 1,
    include: {
      author: {
        select: {
          id: true, name: true, lastName: true, avatarUrl: true,
          reputation: true, membership: true, role: true,
        },
      },
    },
  })
  const hasMore = rows.length > PAGE_SIZE
  const slice = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  const replies: PublicSquareReply[] = slice.map((r) =>
    serializeSquareReply(r, { viewerId: me.id }),
  )
  return NextResponse.json({ replies, hasMore })
}

/** POST /api/square/[id]/replies — text-only reply create. */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return NextResponse.json(apiError('Not found', 404), { status: 404 })
  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, status: true, neighborhoodId: true },
  })
  if (!me?.neighborhoodId) return NextResponse.json(apiError('Not found', 404), { status: 404 })
  if (!isSquareAdminRole(me.role)) {
    return NextResponse.json(apiError('Not found', 404), { status: 404 })
  }
  if (me.status === 'BANNED_TEMP' || me.status === 'BANNED_PERM') {
    return NextResponse.json(apiError('حسابك موقوف', 403, 'BANNED'), { status: 403 })
  }

  const { id: threadId } = await params
  const thread = await db.squareThread.findUnique({
    where: { id: threadId },
    select: { id: true, neighborhoodId: true, status: true },
  })
  if (!thread || thread.status === 'HIDDEN') {
    return NextResponse.json(apiError('Not found', 404), { status: 404 })
  }
  if (thread.neighborhoodId !== me.neighborhoodId && me.role !== 'PLATFORM_MOD' && me.role !== 'SUPER_ADMIN') {
    return NextResponse.json(apiError('Not found', 404), { status: 404 })
  }

  const reqBody = await req.json().catch(() => null)
  const text = reqBody && typeof reqBody.body === 'string' ? reqBody.body.trim() : ''
  if (!text) {
    return NextResponse.json(apiError('اكتب ردك أولًا.', 400, 'REPLY_REQUIRED'), { status: 400 })
  }
  if (text.length < REPLY_MIN) {
    return NextResponse.json(apiError('الرد قصير جدًا.', 400, 'REPLY_TOO_SHORT'), { status: 400 })
  }
  if (text.length > REPLY_MAX) {
    return NextResponse.json(apiError('الرد طويل جدًا.', 400, 'REPLY_TOO_LONG'), { status: 400 })
  }

  const intent = detectSquareIntent(text)
  if (intent?.hard) {
    return NextResponse.json(
      apiError(intent.messageAr, 400, `INTENT_${intent.code.toUpperCase()}`),
      { status: 400 },
    )
  }

  if (!isSuperAdminRole(me.role)) {
    const limit = await checkSquareReplyRateLimit(me.id)
    if (!limit.ok) {
      return NextResponse.json(
        apiError(limit.messageAr, 429, limit.code.toUpperCase()),
        { status: 429 },
      )
    }
  }

  // Reply create + parent thread counters bumped in a single
  // transaction so the list view never sees a stale replyCount.
  const reply = await db.$transaction(async (tx) => {
    const r = await tx.squareReply.create({
      data: { threadId, authorId: me.id, body: text },
      include: {
        author: {
          select: {
            id: true, name: true, lastName: true, avatarUrl: true,
            reputation: true, membership: true, role: true,
          },
        },
      },
    })
    await tx.squareThread.update({
      where: { id: threadId },
      data: {
        replyCount: { increment: 1 },
        lastActivityAt: new Date(),
      },
    })
    return r
  })

  return NextResponse.json({
    reply: serializeSquareReply(reply, { viewerId: me.id }),
  })
}

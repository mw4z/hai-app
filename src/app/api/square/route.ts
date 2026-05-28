import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { apiError } from '@/lib/validation'
import { isSquareAdminRole } from '@/lib/square/isSquareAdmin'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { detectSquareIntent } from '@/lib/square/detectIntent'
import { checkSquareThreadRateLimit } from '@/lib/square/rateLimit'
import { serializeSquareThread, type PublicSquareThread } from '@/lib/square/serializeThread'
import { SquareType } from '@prisma/client'

const PAGE_SIZE = 20
const TITLE_MIN = 4
const TITLE_MAX = 140
const BODY_MAX = 2000

const VALID_TYPES = new Set<SquareType>([
  SquareType.QUESTION,
  SquareType.NOTE,
  SquareType.DISCUSSION,
  SquareType.LIGHT_ALERT,
])

/**
 * GET /api/square — paginated list of threads in the viewer's
 * neighborhood. Pinned first, then by lastActivityAt desc. HIDDEN rows
 * are excluded for non-mods (mods will see them in the Phase 2 mod
 * surface, not the public list).
 *
 * MVP gate: admin-only. Non-admin → 404 (matches the /mod/* convention
 * — we don't advertise the feature's existence).
 */
export async function GET(req: NextRequest) {
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

  const url = new URL(req.url)
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0)

  // Graceful failure if the migration hasn't been applied yet — the
  // endpoint returns an empty list instead of bubbling a 500.
  try {
    const rows = await db.squareThread.findMany({
      where: {
        neighborhoodId: me.neighborhoodId,
        status: 'ACTIVE',
      },
      orderBy: [
        { isPinned: 'desc' },
        { lastActivityAt: 'desc' },
      ],
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

    const followingThreadIds = new Set(
      (await db.squareFollow.findMany({
        where: { userId: me.id, threadId: { in: slice.map((t) => t.id) } },
        select: { threadId: true },
      })).map((f) => f.threadId),
    )

    const threads: PublicSquareThread[] = slice.map((row) =>
      serializeSquareThread(row, { viewerId: me.id, followingThreadIds }),
    )
    return NextResponse.json({ threads, hasMore })
  } catch (err) {
    console.error('[square] GET /api/square failed', err)
    return NextResponse.json({ threads: [], hasMore: false })
  }
}

/**
 * POST /api/square — create a new thread.
 *
 * Body: { title: string, body?: string, type?: SquareType }
 *
 * Text-only by design — we explicitly do NOT read imageUrls, pdfUrl,
 * voiceUrl, or any media field. If a caller sends one we just drop it.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json(apiError('Not found', 404), { status: 404 })

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true, role: true, status: true,
      neighborhoodId: true, createdAt: true, reputation: true,
    },
  })
  if (!me?.neighborhoodId) return NextResponse.json(apiError('Not found', 404), { status: 404 })
  if (!isSquareAdminRole(me.role)) {
    return NextResponse.json(apiError('Not found', 404), { status: 404 })
  }
  if (me.status === 'BANNED_TEMP' || me.status === 'BANNED_PERM') {
    return NextResponse.json(apiError('حسابك موقوف', 403, 'BANNED'), { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json(apiError('Bad request', 400), { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const threadBody = typeof body.body === 'string' ? body.body.trim() : ''
  const rawType = typeof body.type === 'string' ? body.type : 'DISCUSSION'
  const type: SquareType = VALID_TYPES.has(rawType as SquareType)
    ? (rawType as SquareType)
    : SquareType.DISCUSSION

  if (!title) {
    return NextResponse.json(apiError('اكتب عنوانًا للنقاش.', 400, 'TITLE_REQUIRED'), { status: 400 })
  }
  if (title.length < TITLE_MIN) {
    return NextResponse.json(apiError('العنوان قصير جدًا.', 400, 'TITLE_TOO_SHORT'), { status: 400 })
  }
  if (title.length > TITLE_MAX) {
    return NextResponse.json(apiError('العنوان طويل جدًا.', 400, 'TITLE_TOO_LONG'), { status: 400 })
  }
  if (threadBody.length > BODY_MAX) {
    return NextResponse.json(apiError('النص طويل جدًا.', 400, 'BODY_TOO_LONG'), { status: 400 })
  }

  // Content policy — HARD nudges block; SOFT nudges are advisory only
  // and let the post through (the composer already showed the nudge).
  const intent = detectSquareIntent(`${title}\n${threadBody}`)
  if (intent?.hard) {
    return NextResponse.json(
      apiError(intent.messageAr, 400, `INTENT_${intent.code.toUpperCase()}`),
      { status: 400 },
    )
  }

  // Rate limit — SUPER_ADMIN bypasses; everyone else (incl. other mods
  // in MVP) is subject to the new-user/low-rep daily cap.
  if (!isSuperAdminRole(me.role)) {
    const limit = await checkSquareThreadRateLimit({
      id: me.id,
      createdAt: me.createdAt,
      reputation: me.reputation,
    })
    if (!limit.ok) {
      return NextResponse.json(
        apiError(limit.messageAr, 429, limit.code.toUpperCase()),
        { status: 429 },
      )
    }
  }

  const created = await db.squareThread.create({
    data: {
      neighborhoodId: me.neighborhoodId,
      authorId: me.id,
      title,
      body: threadBody || null,
      type,
    },
    include: {
      author: {
        select: {
          id: true, name: true, lastName: true, avatarUrl: true,
          reputation: true, membership: true, role: true,
        },
      },
    },
  })

  // Author auto-follows their own thread so reply notifications work
  // out of the box once Phase 2 push is wired up.
  await db.squareFollow.create({
    data: { threadId: created.id, userId: me.id },
  })
  await db.squareThread.update({
    where: { id: created.id },
    data: { followerCount: { increment: 1 } },
  })

  return NextResponse.json({
    thread: serializeSquareThread(
      { ...created, followerCount: created.followerCount + 1 },
      { viewerId: me.id, followingThreadIds: new Set([created.id]) },
    ),
  })
}

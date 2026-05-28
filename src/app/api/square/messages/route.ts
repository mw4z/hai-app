import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { apiError } from '@/lib/validation'
import { isSquareAdminRole } from '@/lib/square/isSquareAdmin'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { detectSquareIntent } from '@/lib/square/detectIntent'
import { checkSquareMessageRateLimit } from '@/lib/square/rateLimit'
import { isSquareTableMissingError } from '@/lib/square/migrationGate'
import {
  serializeSquareMessage,
  type PublicSquareMessage,
} from '@/lib/square/serializeMessage'
import { SquareKind } from '@prisma/client'

const PAGE_SIZE = 30
const BODY_MIN = 2
const BODY_MAX = 800

const VALID_KINDS = new Set<SquareKind>([
  SquareKind.GENERAL,
  SquareKind.QUESTION,
  SquareKind.NOTE,
  SquareKind.LIGHT_ALERT,
])

/**
 * GET /api/square/messages — paginated list of messages in the viewer's
 * neighborhood, returned in chronological ascending order (oldest first
 * within each page). Cursor-based: `?before=<ISO>` returns the page of
 * messages older than the cursor; omit it for the most-recent page.
 *
 * MVP gate: admin-only. Non-admin → 404 (no advertising the feature).
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
  const beforeRaw = url.searchParams.get('before')
  const before = beforeRaw ? new Date(beforeRaw) : null
  const beforeValid = before && !Number.isNaN(before.getTime()) ? before : null

  try {
    // Pull `take + 1` newest-first so we can answer hasMore in one
    // query; then reverse the slice for ascending-order rendering.
    const rows = await db.squareMessage.findMany({
      where: {
        neighborhoodId: me.neighborhoodId,
        status: 'ACTIVE',
        ...(beforeValid ? { createdAt: { lt: beforeValid } } : {}),
      },
      orderBy: { createdAt: 'desc' },
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
    // Reverse → ascending (oldest first), so the client can append at
    // the bottom and prepend at the top without shuffling.
    const ascending = [...slice].reverse()
    const messages: PublicSquareMessage[] = ascending.map((row) =>
      serializeSquareMessage(row, { viewerId: me.id }),
    )
    return NextResponse.json({ messages, hasMore })
  } catch (err) {
    // Two-track error handling:
    //   - The narrow "table missing yet" case (deploy → migration
    //     window) responds with an empty list — the UI renders the
    //     normal empty state. Server logs a WARN, not an ERROR,
    //     because this is expected during the brief gap.
    //   - Any OTHER Prisma / DB / runtime error is a real fault.
    //     Log and respond 500 so the client surfaces a real error
    //     instead of pretending the Square is empty.
    if (isSquareTableMissingError(err)) {
      console.warn('[square] table missing — empty list (apply migration)', err)
      return NextResponse.json({ messages: [], hasMore: false })
    }
    console.error('[square] GET /api/square/messages failed', err)
    return NextResponse.json(apiError('Server error', 500), { status: 500 })
  }
}

/**
 * POST /api/square/messages — create a message.
 *
 * Body: { body: string, kind?: SquareKind, replyToMessageId?: string }
 *
 * Text-only — no media fields are read. Hard nudges (group-invite URL,
 * repeated phone promo) reject; soft nudges are advisory only and the
 * composer banner already showed them.
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

  const text = typeof body.body === 'string' ? body.body.trim() : ''
  const rawKind = typeof body.kind === 'string' ? body.kind : 'GENERAL'
  const kind: SquareKind = VALID_KINDS.has(rawKind as SquareKind)
    ? (rawKind as SquareKind)
    : SquareKind.GENERAL
  const replyToRaw =
    typeof body.replyToMessageId === 'string' ? body.replyToMessageId.trim() : ''
  const replyToMessageId = replyToRaw ? replyToRaw : null

  if (!text) {
    return NextResponse.json(apiError('اكتب رسالتك أولًا.', 400, 'BODY_REQUIRED'), { status: 400 })
  }
  if (text.length < BODY_MIN) {
    return NextResponse.json(apiError('الرسالة قصيرة جدًا.', 400, 'BODY_TOO_SHORT'), { status: 400 })
  }
  if (text.length > BODY_MAX) {
    return NextResponse.json(apiError('الرسالة طويلة جدًا.', 400, 'BODY_TOO_LONG'), { status: 400 })
  }

  const intent = detectSquareIntent(text)
  if (intent?.hard) {
    return NextResponse.json(
      apiError(intent.messageAr, 400, `INTENT_${intent.code.toUpperCase()}`),
      { status: 400 },
    )
  }

  if (!isSuperAdminRole(me.role)) {
    const limit = await checkSquareMessageRateLimit({
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

  // Validate replyToMessageId — same-neighborhood, ACTIVE, exists.
  if (replyToMessageId) {
    const parent = await db.squareMessage.findUnique({
      where: { id: replyToMessageId },
      select: { neighborhoodId: true, status: true },
    })
    const sameHood = parent && parent.neighborhoodId === me.neighborhoodId
    const visible = parent && parent.status === 'ACTIVE'
    if (!sameHood || !visible) {
      return NextResponse.json(
        apiError('الرسالة الأصلية غير متاحة.', 400, 'REPLY_TARGET_INVALID'),
        { status: 400 },
      )
    }
  }

  const created = await db.squareMessage.create({
    data: {
      neighborhoodId: me.neighborhoodId,
      authorId: me.id,
      body: text,
      kind,
      replyToMessageId,
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

  return NextResponse.json({
    message: serializeSquareMessage(created, { viewerId: me.id }),
  })
}

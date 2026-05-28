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
import { SquareKind, SquareMessageType } from '@prisma/client'

const PAGE_SIZE = 30
const BODY_MIN = 2
const BODY_MAX = 800
const PDF_NAME_MAX = 200
const VOICE_MAX_MS = 5 * 60 * 1000
const VOICE_MAX_BYTES = 6 * 1024 * 1024

const VALID_KINDS = new Set<SquareKind>([
  SquareKind.GENERAL,
  SquareKind.QUESTION,
  SquareKind.NOTE,
  SquareKind.LIGHT_ALERT,
])

const VALID_TYPES = new Set<SquareMessageType>([
  SquareMessageType.TEXT,
  SquareMessageType.LOCATION,
  SquareMessageType.PDF,
  SquareMessageType.VOICE,
  SquareMessageType.STICKER,
])

/** Reusable Prisma include for messages, with one-level reply quote. */
const messageInclude = {
  author: {
    select: {
      id: true, name: true, lastName: true, avatarUrl: true,
      reputation: true, membership: true, role: true,
    },
  },
  replyTo: {
    select: {
      id: true, authorId: true, body: true, type: true, status: true,
      author: { select: { name: true, lastName: true } },
    },
  },
} as const

/**
 * GET /api/square/messages — paginated list of messages in the viewer's
 * neighborhood, returned in chronological ascending order. Cursor-based
 * via ?before=<ISO>; omit for the most-recent page.
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
    const rows = await db.squareMessage.findMany({
      where: {
        neighborhoodId: me.neighborhoodId,
        status: 'ACTIVE',
        // "Delete for me" — filter out rows where this viewer is in
        // the hiddenFor array. Tombstones (type=DELETED) are kept
        // visible so other viewers see the placeholder.
        NOT: { hiddenFor: { has: me.id } },
        ...(beforeValid ? { createdAt: { lt: beforeValid } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
      include: messageInclude,
    })
    const hasMore = rows.length > PAGE_SIZE
    const slice = hasMore ? rows.slice(0, PAGE_SIZE) : rows
    const ascending = [...slice].reverse()
    const messages: PublicSquareMessage[] = ascending.map((row) =>
      serializeSquareMessage(row, { viewerId: me.id }),
    )
    return NextResponse.json({ messages, hasMore })
  } catch (err) {
    if (isSquareTableMissingError(err)) {
      console.warn('[square] table missing — empty list (apply migration)', err)
      return NextResponse.json({ messages: [], hasMore: false })
    }
    console.error('[square] GET /api/square/messages failed', err)
    return NextResponse.json(apiError('Server error', 500), { status: 500 })
  }
}

/**
 * POST /api/square/messages — create a message of one of five types:
 *
 *   - TEXT     (default): body required. detectIntent runs.
 *   - LOCATION: lat + lng required, body is an optional caption.
 *   - PDF     : pdfUrl + pdfName required.
 *   - VOICE   : audioUrl + audioDurationMs required.
 *   - STICKER : imageUrl required, must start with "sticker:" — any
 *               other value (incl. a real https:// image URL) is
 *               rejected. Square does not accept arbitrary image
 *               uploads even when they smell like stickers.
 *
 * Contact + place attachments don't need a separate type — they're
 * encoded into `body` as text snippets (formatContactSnippet output /
 * "/directory/<id>" links), and the bubble's SmartTextWithPlacePreviews
 * + SmartText handle the rendering.
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

  // ── Resolve discriminator + shared fields ────────────────────────
  const rawType = typeof body.type === 'string' ? body.type : 'TEXT'
  const type: SquareMessageType = VALID_TYPES.has(rawType as SquareMessageType)
    ? (rawType as SquareMessageType)
    : SquareMessageType.TEXT

  const rawKind = typeof body.kind === 'string' ? body.kind : 'GENERAL'
  const kind: SquareKind = VALID_KINDS.has(rawKind as SquareKind)
    ? (rawKind as SquareKind)
    : SquareKind.GENERAL

  const replyToRaw =
    typeof body.replyToMessageId === 'string' ? body.replyToMessageId.trim() : ''
  const replyToMessageId = replyToRaw ? replyToRaw : null

  const text = typeof body.body === 'string' ? body.body.trim() : ''

  // ── Per-type payload + validation ────────────────────────────────
  const data: {
    body: string | null
    type: SquareMessageType
    lat?: number | null
    lng?: number | null
    pdfUrl?: string | null
    pdfName?: string | null
    audioUrl?: string | null
    audioDurationMs?: number | null
    audioMimeType?: string | null
    audioSizeBytes?: number | null
    imageUrl?: string | null
  } = { body: null, type }

  if (type === SquareMessageType.TEXT) {
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
    data.body = text
  } else if (type === SquareMessageType.LOCATION) {
    const lat = typeof body.lat === 'number' ? body.lat : NaN
    const lng = typeof body.lng === 'number' ? body.lng : NaN
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(apiError('موقع غير صالح.', 400, 'LOCATION_INVALID'), { status: 400 })
    }
    data.lat = lat
    data.lng = lng
    data.body = text || null
  } else if (type === SquareMessageType.PDF) {
    const pdfUrl = typeof body.pdfUrl === 'string' ? body.pdfUrl.trim() : ''
    const pdfName = typeof body.pdfName === 'string' ? body.pdfName.trim() : ''
    if (!pdfUrl.startsWith('https://') || pdfUrl.length > 500) {
      return NextResponse.json(apiError('ملف PDF غير صالح.', 400, 'PDF_INVALID'), { status: 400 })
    }
    data.pdfUrl = pdfUrl
    data.pdfName = (pdfName || 'document.pdf').slice(0, PDF_NAME_MAX)
    data.body = text || null
  } else if (type === SquareMessageType.VOICE) {
    const audioUrl = typeof body.audioUrl === 'string' ? body.audioUrl.trim() : ''
    const audioDurationMs = Number.isFinite(body.audioDurationMs) ? Math.floor(body.audioDurationMs) : 0
    const audioMimeType = typeof body.audioMimeType === 'string' ? body.audioMimeType.trim().slice(0, 80) : null
    const audioSizeBytes = Number.isFinite(body.audioSizeBytes) ? Math.floor(body.audioSizeBytes) : null
    if (!audioUrl.startsWith('https://') || audioUrl.length > 500) {
      return NextResponse.json(apiError('ملف صوتي غير صالح.', 400, 'VOICE_INVALID'), { status: 400 })
    }
    if (audioDurationMs <= 0 || audioDurationMs > VOICE_MAX_MS) {
      return NextResponse.json(apiError('الرسالة الصوتية طويلة جدًا.', 400, 'VOICE_TOO_LONG'), { status: 400 })
    }
    if (audioSizeBytes != null && audioSizeBytes > VOICE_MAX_BYTES) {
      return NextResponse.json(apiError('حجم الملف الصوتي كبير جدًا.', 400, 'VOICE_TOO_LARGE'), { status: 400 })
    }
    data.audioUrl = audioUrl
    data.audioDurationMs = audioDurationMs
    data.audioMimeType = audioMimeType
    data.audioSizeBytes = audioSizeBytes
  } else if (type === SquareMessageType.STICKER) {
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''
    // HARD POLICY: stickers ride on a "sticker:<id>" sentinel ONLY.
    // Reject any value that even looks like a URL — Square has no
    // image uploads, and we don't want a sneaky "send arbitrary
    // image as a sticker" bypass.
    if (!/^sticker:[a-z0-9_-]{1,80}$/i.test(imageUrl)) {
      return NextResponse.json(apiError('ملصق غير صالح.', 400, 'STICKER_INVALID'), { status: 400 })
    }
    data.imageUrl = imageUrl
  }

  // ── Shared rate-limit (SUPER_ADMIN bypasses) ─────────────────────
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

  // ── Reply target validation — same scope as v1 ───────────────────
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
      kind,
      replyToMessageId,
      ...data,
    },
    include: messageInclude,
  })

  return NextResponse.json({
    message: serializeSquareMessage(created, { viewerId: me.id }),
  })
}

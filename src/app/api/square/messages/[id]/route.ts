import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { apiError } from '@/lib/validation'
import { isSquareAdminRole } from '@/lib/square/isSquareAdmin'
import { isSquareModRole } from '@/lib/square/lock'

interface Params { params: Promise<{ id: string }> }

/** "Delete for everyone" cutoff — author can tombstone their own
 *  message within this window after sending. Mirrors WhatsApp's
 *  ~1 hour rule. SUPER_ADMIN bypasses. */
const DELETE_FOR_ALL_WINDOW_MS = 60 * 60 * 1000

/**
 * DELETE /api/square/messages/[id]
 *
 * Query / body shape: { scope: 'me' | 'all' } — default 'me'.
 *
 *   - scope='me'  → hide the message from the CURRENT user's view
 *                   only (append to hiddenBy array). Works on any
 *                   message in the user's neighborhood, including
 *                   tombstones; safe / non-destructive.
 *   - scope='all' → set type=DELETED + clear body/media. Only the
 *                   message AUTHOR can do this, and only within
 *                   DELETE_FOR_ALL_WINDOW_MS of createdAt (or any
 *                   SUPER_ADMIN). Other users will see the
 *                   tombstone on next list / refresh.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
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

  // Scope can come via query (?scope=me) for a no-body DELETE, or via
  // JSON body — accept both since some HTTP clients are flaky about
  // bodies on DELETE.
  const url = new URL(req.url)
  const queryScope = url.searchParams.get('scope')
  let scope = queryScope || 'me'
  try {
    const body = await req.json().catch(() => null)
    if (body && typeof body.scope === 'string') scope = body.scope
  } catch { /* ignore — no body is fine */ }
  if (scope !== 'me' && scope !== 'all') scope = 'me'

  const { id } = await params
  const msg = await db.squareMessage.findUnique({
    where: { id },
    select: {
      id: true, neighborhoodId: true, authorId: true,
      type: true, createdAt: true, hiddenFor: true,
    },
  })
  if (!msg) return NextResponse.json(apiError('Not found', 404), { status: 404 })
  if (msg.neighborhoodId !== me.neighborhoodId && me.role !== 'PLATFORM_MOD' && me.role !== 'SUPER_ADMIN') {
    return NextResponse.json(apiError('Not found', 404), { status: 404 })
  }

  if (scope === 'me') {
    // Idempotent — already hidden? no-op.
    if (msg.hiddenFor.includes(me.id)) {
      return NextResponse.json({ ok: true, scope: 'me', alreadyHidden: true })
    }
    await db.squareMessage.update({
      where: { id: msg.id },
      data: { hiddenFor: { push: me.id } },
    })
    return NextResponse.json({ ok: true, scope: 'me' })
  }

  // scope === 'all' — destructive. Allowed callers:
  //   - The author, only within the 60-min cutoff window
  //     (WhatsApp-style "you can unsend recent messages").
  //   - Any Square moderator (NEIGHBORHOOD_MOD / PLATFORM_MOD /
  //     SUPER_ADMIN) on ANY message in their neighborhood, no
  //     time window. Moderation tier — they need to be able to
  //     remove abusive content immediately.
  const isMod = isSquareModRole(me.role)
  if (!isMod) {
    if (msg.authorId !== me.id) {
      return NextResponse.json(
        apiError('يمكنك حذف رسائلك فقط.', 403, 'DELETE_NOT_AUTHOR'),
        { status: 403 },
      )
    }
    const age = Date.now() - new Date(msg.createdAt).getTime()
    if (age > DELETE_FOR_ALL_WINDOW_MS) {
      return NextResponse.json(
        apiError(
          'انتهت مدة الحذف للجميع لهذه الرسالة.',
          400,
          'DELETE_FOR_ALL_TOO_LATE',
        ),
        { status: 400 },
      )
    }
  }
  if (msg.type === 'DELETED') {
    return NextResponse.json({ ok: true, scope: 'all', alreadyDeleted: true })
  }

  await db.squareMessage.update({
    where: { id: msg.id },
    data: {
      type: 'DELETED',
      body: null,
      lat: null,
      lng: null,
      pdfUrl: null,
      pdfName: null,
      audioUrl: null,
      audioDurationMs: null,
      audioMimeType: null,
      audioSizeBytes: null,
      imageUrl: null,
      reactions: [],
    },
  })

  return NextResponse.json({ ok: true, scope: 'all' })
}

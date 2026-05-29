import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { apiError } from '@/lib/validation'
import { isSquareAdminRole } from '@/lib/square/isSquareAdmin'
import { kickNotifCron } from '@/lib/kickNotifCron'

interface Params { params: Promise<{ id: string }> }

/** Whitelisted emoji set — same QUICK_EMOJIS DM exposes, plus a few
 *  bilingual community-friendly ones. Anything outside this set is
 *  rejected so the column doesn't accumulate arbitrary unicode. */
const ALLOWED_EMOJIS = new Set([
  '❤️', '👍', '👎', '😂', '😮', '😢', '🤲', '🔥', '🙏', '✅',
])

interface ReactionEntry {
  emoji: string
  userId: string
}

/**
 * POST /api/square/messages/[id]/react
 *
 * Body: { emoji: string }
 *
 * Toggles a per-user reaction. Rules:
 *   - Caller must be a Square admin in the message's neighborhood.
 *   - Message must be ACTIVE.
 *   - Emoji must be in the whitelist (anti-garbage).
 *   - One reaction per user per message — calling with the SAME emoji
 *     the user already has removes it; calling with a DIFFERENT
 *     emoji replaces it; calling with no prior reaction adds it.
 */
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

  const body = await req.json().catch(() => null)
  const emoji = body && typeof body.emoji === 'string' ? body.emoji.trim() : ''
  if (!emoji || !ALLOWED_EMOJIS.has(emoji)) {
    return NextResponse.json(
      apiError('رمز تعبيري غير مدعوم.', 400, 'REACTION_INVALID'),
      { status: 400 },
    )
  }

  const { id } = await params
  const msg = await db.squareMessage.findUnique({
    where: { id },
    select: { id: true, neighborhoodId: true, status: true, reactions: true, authorId: true, body: true, type: true },
  })
  if (!msg || msg.neighborhoodId !== me.neighborhoodId) {
    return NextResponse.json(apiError('Not found', 404), { status: 404 })
  }
  if (msg.status !== 'ACTIVE') {
    return NextResponse.json(apiError('الرسالة غير متاحة.', 400, 'MESSAGE_HIDDEN'), { status: 400 })
  }

  const current: ReactionEntry[] = Array.isArray(msg.reactions)
    ? (msg.reactions as unknown as ReactionEntry[]).filter(
        (r) => r && typeof r.emoji === 'string' && typeof r.userId === 'string',
      )
    : []

  // Toggle / replace / add — exactly the DM semantics.
  const mine = current.find((r) => r.userId === me.id)
  let next: ReactionEntry[]
  if (mine && mine.emoji === emoji) {
    next = current.filter((r) => r.userId !== me.id)
  } else if (mine) {
    next = current.map((r) => (r.userId === me.id ? { emoji, userId: me.id } : r))
  } else {
    next = [...current, { emoji, userId: me.id }]
  }

  const updated = await db.squareMessage.update({
    where: { id: msg.id },
    data: { reactions: next as unknown as object[] },
    select: { reactions: true },
  })

  // ── Reaction notification ─────────────────────────────────────────
  // Fire ONLY on an additive reaction (no prior mine, or replace) —
  // not on removal (no point pinging someone because a reaction was
  // un-set). Skip self-reactions. Dedup key is (messageId, reactorId,
  // emoji) so flipping emoji X→Y→X doesn't spam the author.
  const isAddition = !mine || mine.emoji !== emoji
  if (isAddition && msg.authorId !== me.id) {
    try {
      const actor = await db.user.findUnique({
        where: { id: me.id },
        select: { name: true },
      })
      const actorName = (actor?.name || '').trim() || 'جار'
      const preview = (msg.body || '').trim().slice(0, 180) ||
        (msg.type === 'VOICE' ? '🎙️' : msg.type === 'PDF' ? '📄' : msg.type === 'LOCATION' ? '📍' : msg.type === 'STICKER' ? '✨' : '')
      await db.$transaction(async (tx) => {
        await tx.notification.create({
          data: {
            type: 'SYSTEM' as const,
            userId: msg.authorId,
            actorId: me.id,
            actorName,
            title: `${emoji} تفاعل جديد على رسالتك`,
            titleEn: `${emoji} New reaction on your message`,
            body: preview,
            bodyEn: preview,
            squareMessageId: msg.id,
          },
        })
        await tx.notifJob.create({
          data: {
            type: 'square_reaction',
            priority: 'normal',
            targetType: 'user',
            targetRef: msg.authorId,
            dedupKey: `square_reaction:${msg.id}:${me.id}:${emoji}`,
            payload: {
              messageId: msg.id,
              emoji,
              actorId: me.id,
              actorName,
              preview,
            },
          },
        })
      })
      try { kickNotifCron() } catch { /* fire-and-forget */ }
    } catch (err) {
      console.warn('[SQUARE_REACTION_NOTIF] failed:', (err as Error)?.message)
    }
  }

  return NextResponse.json({ reactions: updated.reactions })
}

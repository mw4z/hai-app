import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { apiError } from '@/lib/validation'
import { isSquareAdminRole } from '@/lib/square/isSquareAdmin'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { kickNotifCron } from '@/lib/kickNotifCron'
import { fullName } from '@/lib/displayName'

const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000

interface Params { params: Promise<{ id: string }> }

/**
 * POST /api/square/messages/[id]/notify
 *
 * Author-fired "notify neighbors" on a Square message. Lets a user
 * draw extra attention to a single message (e.g. a question they
 * want neighbors to actually answer) without forcing every Square
 * message into a push.
 *
 * Strict gates so the action stays a rare-and-meaningful nudge,
 * not a spam vector:
 *   1. Caller must be a Square admin (whole feature is admin-only
 *      in MVP) and the message must belong to the caller's
 *      neighborhood.
 *   2. Caller must be the message's author.
 *   3. The message must be ACTIVE (HIDDEN messages can't fire).
 *   4. The message must not have been fired on before
 *      (notificationFiredAt is null).
 *   5. The author must not have fired ANY other message in the
 *      past 24h. SUPER_ADMIN bypasses this.
 *
 * On success: creates Notification rows for every OTHER admin user
 * in the same neighborhood (type=SYSTEM), then kicks the existing
 * push cron so the OS notification fans out via the normal pipe.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) return NextResponse.json(apiError('Not found', 404), { status: 404 })

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true, role: true, status: true, neighborhoodId: true,
      name: true, lastName: true,
    },
  })
  if (!me?.neighborhoodId) return NextResponse.json(apiError('Not found', 404), { status: 404 })
  if (!isSquareAdminRole(me.role)) {
    return NextResponse.json(apiError('Not found', 404), { status: 404 })
  }
  if (me.status === 'BANNED_TEMP' || me.status === 'BANNED_PERM') {
    return NextResponse.json(apiError('حسابك موقوف', 403, 'BANNED'), { status: 403 })
  }

  const { id } = await params
  const msg = await db.squareMessage.findUnique({
    where: { id },
    select: {
      id: true, neighborhoodId: true, authorId: true, status: true,
      body: true, type: true, notificationFiredAt: true,
    },
  })
  if (!msg) return NextResponse.json(apiError('Not found', 404), { status: 404 })
  if (msg.neighborhoodId !== me.neighborhoodId) {
    return NextResponse.json(apiError('Not found', 404), { status: 404 })
  }
  if (msg.authorId !== me.id) {
    return NextResponse.json(
      apiError('يمكنك تنبيه الجيران على رسائلك فقط.', 403, 'NOTIFY_NOT_AUTHOR'),
      { status: 403 },
    )
  }
  if (msg.status !== 'ACTIVE') {
    return NextResponse.json(
      apiError('الرسالة غير متاحة.', 400, 'NOTIFY_HIDDEN'),
      { status: 400 },
    )
  }
  if (msg.notificationFiredAt) {
    return NextResponse.json(
      apiError('تم التنبيه على هذه الرسالة من قبل.', 400, 'NOTIFY_ALREADY_FIRED'),
      { status: 400 },
    )
  }

  // Per-user 24h rate limit — SUPER_ADMIN bypasses.
  if (!isSuperAdminRole(me.role)) {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS)
    const recent = await db.squareMessage.findFirst({
      where: {
        authorId: me.id,
        notificationFiredAt: { gte: since },
      },
      select: { id: true },
    })
    if (recent) {
      return NextResponse.json(
        apiError(
          'يمكنك إرسال تنبيه واحد فقط كل 24 ساعة في الساحة.',
          429,
          'NOTIFY_RATE_LIMIT',
        ),
        { status: 429 },
      )
    }
  }

  const actorName = (fullName(me) || me.name || '').slice(0, 80)
  const preview = previewFor(msg.type, msg.body)
  const titleAr = 'تنبيه في الساحة'
  const titleEn = 'Square notice'
  const bodyAr = actorName ? `${actorName}: ${preview}` : preview
  const bodyEn = actorName ? `${actorName}: ${preview}` : preview

  // Recipients = every OTHER admin user in the same neighborhood.
  // Once Square opens to all residents, this can widen to all
  // users; the gate then becomes a feature-flag flip.
  const recipients = await db.user.findMany({
    where: {
      neighborhoodId: me.neighborhoodId,
      id: { not: me.id },
      role: { in: ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN'] },
      status: 'ACTIVE',
    },
    select: { id: true },
  })

  await db.$transaction(async (tx) => {
    await tx.squareMessage.update({
      where: { id: msg.id },
      data: { notificationFiredAt: new Date() },
    })
    if (recipients.length > 0) {
      // In-app bell entries for each recipient.
      await tx.notification.createMany({
        data: recipients.map((u) => ({
          type: 'SYSTEM' as const,
          userId: u.id,
          actorId: me.id,
          actorName,
          title: titleAr,
          titleEn,
          body: bodyAr,
          bodyEn,
        })),
      })
      // ALSO enqueue ONE NotifJob so the push cron actually fans out
      // OS notifications. Previously the route only created bell
      // rows + kicked the cron — but the cron only processes NotifJob
      // rows, so no push ever fired. The handler lives in
      // /api/cron/process-notifs (case 'square_notify') and
      // resolves recipients itself (admin users in the neighborhood,
      // minus the actor) before calling sendPushBatch.
      await tx.notifJob.create({
        data: {
          type: 'square_notify',
          priority: 'high',
          targetType: 'nbhd_topic',
          // me.neighborhoodId is non-null at this point (we gated on
          // it at the top of the handler) — assert for the type
          // narrower since Prisma's transaction client doesn't carry
          // the narrowing through.
          targetRef: me.neighborhoodId!,
          dedupKey: `square_notify:${msg.id}`,
          payload: {
            messageId: msg.id,
            actorId: me.id,
            actorName,
            preview,
          },
        },
      })
    }
  })

  // Wake the push cron so OS notifications fan out within ~1-2s,
  // not on the next minute-mark.
  try { kickNotifCron() } catch { /* fire-and-forget */ }

  return NextResponse.json({
    ok: true,
    recipients: recipients.length,
    notificationFiredAt: new Date().toISOString(),
  })
}

/** Short human-readable preview for the push body, per message type. */
function previewFor(type: string, body: string | null): string {
  const trimmed = (body || '').trim()
  switch (type) {
    case 'VOICE':    return '🎤 رسالة صوتية'
    case 'PDF':      return '📄 ملف PDF'
    case 'LOCATION': return '📍 موقع'
    case 'STICKER':  return '🖼️ ملصق'
    default:         return trimmed.slice(0, 80) || 'رسالة في الساحة'
  }
}

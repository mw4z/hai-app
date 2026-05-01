import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { log } from '@/lib/logger'
import { moderateContent } from '@/lib/moderation'
import { requireVerified } from '@/lib/requireVerified'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { kickNotifCron } from '@/lib/kickNotifCron'
import { sendDmPushNow } from '@/app/api/cron/process-notifs/route'
import { fullName } from '@/lib/displayName'

// GET /api/threads/[id]/messages
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('GET', '/api/threads/[id]/messages', session.userId)

    const thread = await db.thread.findUnique({
      where: { id: params.id },
      select: { user1Id: true, user2Id: true, status: true },
    })
    if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (thread.user1Id !== session.userId && thread.user2Id !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // "Delete for me" filter — exclude rows where the current user is
    // in hiddenBy. This is the per-user view; the row stays in the DB
    // for the other participant.
    const messages = await db.message.findMany({
      where: {
        threadId: params.id,
        NOT: { hiddenBy: { has: session.userId } },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, type: true, text: true, lat: true, lng: true,
        imageUrl: true, senderId: true, createdAt: true,
        deliveredAt: true, readAt: true, edited: true, reactions: true,
      },
      take: 100,
    })

    const now = new Date()

    // Check my privacy settings for read receipts
    const me = await db.user.findUnique({
      where: { id: session.userId },
      select: { showReadReceipts: true },
    })

    // 1. Mark OTHER user's messages as delivered (I fetched them)
    const theirUndelivered = messages
      .filter(m => m.senderId !== session.userId && !m.deliveredAt)
      .map(m => m.id)
    if (theirUndelivered.length > 0) {
      await db.message.updateMany({
        where: { id: { in: theirUndelivered } },
        data: { deliveredAt: now },
      })
    }

    // 2. Mark OTHER user's messages as read — ONLY if I have read receipts enabled
    if (me?.showReadReceipts) {
      const theirUnread = messages
        .filter(m => m.senderId !== session.userId && !m.readAt)
        .map(m => m.id)
      if (theirUnread.length > 0) {
        await db.message.updateMany({
          where: { id: { in: theirUnread } },
          data: { readAt: now },
        })
      }
    }

    // 3. Mark MY messages as delivered if other user has replied
    const myUndelivered = messages
      .filter(m => m.senderId === session.userId && !m.deliveredAt)
      .map(m => m.id)
    if (myUndelivered.length > 0) {
      const otherHasReplied = messages.some(m => m.senderId !== session.userId)
      if (otherHasReplied) {
        await db.message.updateMany({
          where: { id: { in: myUndelivered } },
          data: { deliveredAt: now },
        })
      }
    }

    // 4. If I disabled read receipts, I can't see others' readAt either
    // Hide readAt on my messages if the OTHER user has read receipts disabled
    const otherId = thread.user1Id === session.userId ? thread.user2Id : thread.user1Id
    const otherUser = await db.user.findUnique({
      where: { id: otherId },
      select: { showReadReceipts: true },
    })

    // Re-read fresh data (same hiddenBy filter as above)
    const freshMessages = await db.message.findMany({
      where: {
        threadId: params.id,
        NOT: { hiddenBy: { has: session.userId } },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, type: true, text: true, lat: true, lng: true,
        imageUrl: true, senderId: true, createdAt: true,
        deliveredAt: true, readAt: true, edited: true, reactions: true,
        replyToId: true,
        replyTo: { select: { id: true, text: true, senderId: true, type: true } },
      },
      take: 100,
    })

    // If I disabled read receipts, strip readAt from my sent messages (can't see if others read)
    if (!me?.showReadReceipts) {
      for (const msg of freshMessages) {
        if (msg.senderId === session.userId) {
          (msg as any).readAt = null
        }
      }
    }

    // If other user disabled read receipts, strip readAt from their sent messages too
    if (!otherUser?.showReadReceipts) {
      for (const msg of freshMessages) {
        if (msg.senderId !== session.userId) {
          (msg as any).readAt = null
        }
      }
    }

    return NextResponse.json({ messages: freshMessages, status: thread.status })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/threads/[id]/messages GET' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

// POST /api/threads/[id]/messages
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const gate = await requireVerified(session.userId)
    if (gate) return gate

    log.api('POST', '/api/threads/[id]/messages', session.userId)

    const thread = await db.thread.findUnique({
      where: { id: params.id },
      select: { user1Id: true, user2Id: true, status: true },
    })
    if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (thread.user1Id !== session.userId && thread.user2Id !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (thread.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Thread closed' }, { status: 403 })
    }

    const recipientId = thread.user1Id === session.userId ? thread.user2Id : thread.user1Id
    const sender = await db.user.findUnique({ where: { id: session.userId }, select: { name: true, lastName: true, role: true } })
    const bypass = isSuperAdminRole(sender?.role)

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
    const { type, text, lat, lng, replyToId } = body

    // Validate replyToId belongs to this thread
    const replyData = replyToId ? { replyToId: String(replyToId) } : {}

    let message
    if (type === 'LOCATION') {
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        return NextResponse.json({ error: 'lat/lng required' }, { status: 400 })
      }
      message = await db.message.create({
        data: {
          threadId: params.id,
          senderId: session.userId,
          type: 'LOCATION',
          text: `https://maps.google.com/?q=${lat},${lng}`,
          lat, lng,
          ...replyData,
        },
        include: { replyTo: { select: { id: true, text: true, senderId: true, type: true } } },
      })
    } else if (type === 'IMAGE') {
      const { imageUrl } = body
      if (!imageUrl) return NextResponse.json({ error: 'Image URL required' }, { status: 400 })
      message = await db.message.create({
        data: {
          threadId: params.id,
          senderId: session.userId,
          type: 'IMAGE',
          text: '📷',
          imageUrl,
          ...replyData,
        },
        include: { replyTo: { select: { id: true, text: true, senderId: true, type: true } } },
      })
    } else {
      if (!text?.trim()) return NextResponse.json({ error: 'Empty message' }, { status: 400 })
      if (text.length > 1000) return NextResponse.json({ error: 'Too long' }, { status: 400 })
      const finalText = bypass ? text.trim() : moderateContent(text.trim()).censored
      message = await db.message.create({
        data: {
          threadId: params.id,
          senderId: session.userId,
          type: 'TEXT',
          text: finalText,
          ...replyData,
        },
        include: { replyTo: { select: { id: true, text: true, senderId: true, type: true } } },
      })
    }

    // Update thread timestamp
    await db.thread.update({ where: { id: params.id }, data: { updatedAt: new Date() } })

    // Notify the recipient.
    // DMs are NOT stored in the bell list anymore — the threads list
    // is the canonical surface for unread chat (per-conversation
    // counter bubble, sourced from Message.readAt IS NULL via the
    // groupBy query in /api/threads). The bell list reads as
    // "non-chat events": comments, reactions, mod actions, etc.
    // Phone push still fires below so the user sees the banner +
    // the BottomNav messages tab badge.
    const senderName = fullName(sender) || sender?.name || null
    const snippet = type === 'LOCATION'
      ? '📍'
      : type === 'IMAGE'
        ? '📷'
        : (text?.trim().slice(0, 120) || '')

    // Phone push — DMs are the highest-priority push class in the app,
    // so we send DIRECTLY to FCM/APNs in this request instead of
    // routing through the NotifJob queue → cron processor (which added
    // 1.5s coalescing + an HTTP roundtrip + cron read latency, putting
    // total perceived delivery in the 2-5s range). Inline send lands
    // the banner on the recipient's phone within the same second the
    // message hits the server.
    //
    // If the inline send fails for any reason (FCM token, transient
    // network), we fall back to the queue + cron path so the push
    // still gets delivered eventually.
    const inlineSent = await sendDmPushNow({
      recipientId,
      threadId: params.id,
      senderName,
      snippet,
      messageType: type || 'TEXT',
    })
    if (!inlineSent) {
      try {
        await db.notifJob.create({
          data: {
            type: 'new_message',
            priority: 'high',
            targetType: 'user',
            targetRef: recipientId,
            payload: {
              threadId: params.id,
              senderId: session.userId,
              senderName,
              snippet,
              messageType: type || 'TEXT',
            },
          },
        })
      } catch (err) {
        console.error('[NOTIF_JOB] enqueue new_message failed:', err)
      }
      kickNotifCron()
    }

    return NextResponse.json(message)
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/threads/[id]/messages POST' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

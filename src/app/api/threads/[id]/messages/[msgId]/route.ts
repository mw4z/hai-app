import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { sendCleanupPush } from '@/lib/notifications'

// DELETE /api/threads/[id]/messages/[msgId]?scope=me|all
//
// scope=me  → "Delete for me only". Append userId to Message.hiddenBy.
//             Available to either thread participant. No time limit.
// scope=all → "Delete for everyone". Tombstone the message (type=DELETED).
//             Sender-only, within 24h of creation.
//
// Default (no scope) = "all" for back-compat with the older client.
export async function DELETE(req: NextRequest, { params }: { params: { id: string; msgId: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const scope = url.searchParams.get('scope') === 'me' ? 'me' : 'all'

    const message = await db.message.findUnique({
      where: { id: params.msgId },
      select: { senderId: true, threadId: true, createdAt: true, hiddenBy: true },
    })
    if (!message) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (message.threadId !== params.id) return NextResponse.json({ error: 'Mismatch' }, { status: 400 })

    // Both scopes require participation in the thread.
    const thread = await db.thread.findUnique({
      where: { id: params.id },
      select: { user1Id: true, user2Id: true },
    })
    if (!thread || (thread.user1Id !== session.userId && thread.user2Id !== session.userId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (scope === 'me') {
      // Idempotent — if the user already hid it, do nothing.
      if (!message.hiddenBy.includes(session.userId)) {
        await db.message.update({
          where: { id: params.msgId },
          data: { hiddenBy: { push: session.userId } },
        })
      }
      // Clear THIS user's NEW_MESSAGE bell rows for this thread —
      // they hide-for-me'd, the bell entry referencing it should
      // disappear from their side. Other party's notifications are
      // untouched (they still see the message). Awaited so the API
      // response only resolves after the delete commits, otherwise
      // the client's tray-sweep races and misses the clear.
      try {
        await db.notification.deleteMany({
          where: {
            threadId: params.id,
            userId: session.userId,
            type: 'NEW_MESSAGE',
          },
        })
        // AWAITED, not fire-and-forget. On Vercel, once the route
        // response goes out the function instance may be torn down
        // before a `void`'d background promise resolves, causing
        // the cleanup push to silently never reach APNs. Awaiting
        // costs ~200-500ms on the delete response but guarantees
        // delivery. Per-message collapseId so iOS replaces the
        // specific banner the original push produced.
        await sendCleanupPush(
          [session.userId],
          { contentType: 'thread', contentId: params.id },
          `message:${params.msgId}`,
        ).catch((err) => {
          console.warn('[DM_DELETE] cleanup push (me) failed:', err?.message || err)
        })
      } catch { /* non-fatal */ }
      return NextResponse.json({ success: true, scope: 'me' })
    }

    // scope === 'all' — sender-only, 24h window.
    if (message.senderId !== session.userId) {
      return NextResponse.json({ error: 'Only sender can delete for everyone' }, { status: 403 })
    }
    if (Date.now() - new Date(message.createdAt).getTime() > 24 * 60 * 60_000) {
      return NextResponse.json({ error: 'Too late to delete for everyone (24h limit)' }, { status: 403 })
    }
    await db.message.update({
      where: { id: params.msgId },
      data: { type: 'DELETED', text: null, imageUrl: null, lat: null, lng: null },
    })
    // Clear bell notifications for this thread that point at the
    // tombstoned message. Was filtered to `read: false` only and
    // fire-and-forget — wrong on both counts:
    //  - Read filter left stale notifications around when the
    //    recipient had already opened/seen them.
    //  - Fire-and-forget meant the API response came back BEFORE
    //    the DB delete committed, so the client's tray-sweep
    //    fetched /api/notifications/active-refs and got the
    //    pre-delete view → threadId still in active-refs →
    //    tray entry not cleared. Awaited now so the response
    //    only resolves after notifications are gone.
    try {
      await db.notification.deleteMany({
        where: { threadId: params.id, type: 'NEW_MESSAGE' },
      })
      // AWAITED so the function instance doesn't terminate before
      // APNs accepts the push. Per-message collapseId so iOS
      // replaces the specific banner this message produced (every
      // new DM uses `message:MSGID` as its collapse identifier,
      // see processNewMessage / sendDmPushNow).
      await sendCleanupPush(
        [thread.user1Id, thread.user2Id],
        { contentType: 'thread', contentId: params.id },
        `message:${params.msgId}`,
      ).catch((err) => {
        console.warn('[DM_DELETE] cleanup push (all) failed:', err?.message || err)
      })
    } catch { /* non-fatal */ }
    return NextResponse.json({ success: true, scope: 'all' })
  } catch (error) {
    console.error('delete message error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH /api/threads/[id]/messages/[msgId]
export async function PATCH(req: NextRequest, { params }: { params: { id: string; msgId: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const message = await db.message.findUnique({
      where: { id: params.msgId },
      select: { senderId: true, threadId: true, createdAt: true, type: true },
    })

    if (!message) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (message.threadId !== params.id) return NextResponse.json({ error: 'Mismatch' }, { status: 400 })
    if (message.senderId !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (message.type !== 'TEXT') return NextResponse.json({ error: 'Only text messages can be edited' }, { status: 400 })

    // Only allow edit within 15 minutes
    if (Date.now() - new Date(message.createdAt).getTime() > 15 * 60_000) {
      return NextResponse.json({ error: 'Too late to edit' }, { status: 403 })
    }

    const { text } = await req.json()
    if (!text?.trim()) return NextResponse.json({ error: 'Empty text' }, { status: 400 })
    if (text.length > 1000) return NextResponse.json({ error: 'Too long' }, { status: 400 })

    const updated = await db.message.update({
      where: { id: params.msgId },
      data: { text: text.trim(), edited: true },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('edit message error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

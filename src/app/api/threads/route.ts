import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canStartPrivateThread } from '@/lib/thread-rules'
import { log } from '@/lib/logger'
import { getBlockedUserIds } from '@/lib/blocks'
import { requireVerified } from '@/lib/requireVerified'

// GET /api/threads — list user's threads
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('GET', '/api/threads', session.userId)

    const threads = await db.thread.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ user1Id: session.userId }, { user2Id: session.userId }],
      },
      include: {
        user1: { select: { id: true, name: true, avatarUrl: true } },
        user2: { select: { id: true, name: true, avatarUrl: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { text: true, type: true, createdAt: true, senderId: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    // Filter out threads with blocked users
    const blockedIds = await getBlockedUserIds(session.userId)
    const filtered = blockedIds.length > 0
      ? threads.filter(t => {
          const otherId = t.user1Id === session.userId ? t.user2Id : t.user1Id
          return !blockedIds.includes(otherId)
        })
      : threads

    // Get post titles for threads with posts
    const postIds = filtered.map(t => t.postId).filter(Boolean) as string[]
    const posts = postIds.length > 0
      ? await db.post.findMany({
          where: { id: { in: postIds } },
          select: { id: true, title: true, category: true, coordinationMode: true },
        })
      : []
    const postMap = new Map(posts.map(p => [p.id, p]))

    const result = filtered.map(t => {
      const other = t.user1Id === session.userId ? t.user2 : t.user1
      const lastMsg = t.messages[0] || null
      const post = t.postId ? postMap.get(t.postId) : null
      return {
        id: t.id,
        other,
        postTitle: post?.title || null,
        postCategory: post?.category || null,
        isExclusive: post?.coordinationMode === 'EXCLUSIVE',
        lastMessage: lastMsg ? {
          text: lastMsg.type === 'LOCATION' ? '📍' : lastMsg.type === 'IMAGE' ? '📷' : (lastMsg.text?.slice(0, 50) || ''),
          isMe: lastMsg.senderId === session.userId,
          createdAt: lastMsg.createdAt,
        } : null,
        updatedAt: t.updatedAt,
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/threads GET' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

// POST /api/threads — create or get existing thread
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const gate = await requireVerified(session.userId)
    if (gate) return gate

    log.api('POST', '/api/threads', session.userId)

    let reqBody: any
    try { reqBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
    const { userId, postId } = reqBody
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
    if (userId === session.userId) return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 })

    // Block check — cannot message blocked users
    const blockExists = await db.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: session.userId, blockedId: userId },
          { blockerId: userId, blockedId: session.userId },
        ],
      },
    })
    if (blockExists) return NextResponse.json({ error: 'لا يمكنك التواصل مع هذا المستخدم / Cannot contact this user' }, { status: 403 })

    // If thread is about a specific post, validate category + coordination mode
    if (postId) {
      const post = await db.post.findUnique({
        where: { id: postId },
        select: { category: true, coordinationMode: true, activeThreadId: true, authorId: true, status: true },
      })

      // Block threads on categories that don't allow private contact
      if (post && !canStartPrivateThread(post.category)) {
        return NextResponse.json({ error: 'هذا النوع من المنشورات لا يدعم المحادثات الخاصة' }, { status: 403 })
      }

      if (post?.coordinationMode === 'EXCLUSIVE') {
        // If post already has an active thread and it's not with this user
        if (post.activeThreadId) {
          const existingThread = await db.thread.findUnique({
            where: { id: post.activeThreadId },
            select: { user1Id: true, user2Id: true },
          })
          // Allow the existing thread participants to access it
          if (existingThread &&
              existingThread.user1Id !== session.userId &&
              existingThread.user2Id !== session.userId) {
            return NextResponse.json({ error: 'claimed', message: 'تم التنسيق مع شخص آخر' }, { status: 409 })
          }
          // Return existing thread for the active participant
          return NextResponse.json({ threadId: post.activeThreadId })
        }
      }
    }

    // Ensure consistent ordering for unique constraint
    const [u1, u2] = [session.userId, userId].sort()

    // Find existing ACTIVE thread between these users for this post
    let thread = await db.thread.findFirst({
      where: {
        user1Id: u1,
        user2Id: u2,
        status: 'ACTIVE',
        ...(postId ? { postId } : { postId: null }),
      },
    })

    if (!thread) {
      // Delete old closed/expired threads for this pair+post to free the unique constraint
      await db.thread.deleteMany({
        where: {
          user1Id: u1,
          user2Id: u2,
          status: { not: 'ACTIVE' },
          ...(postId ? { postId } : { postId: null }),
        },
      })

      try {
        thread = await db.thread.create({
          data: { user1Id: u1, user2Id: u2, postId: postId || null },
        })
      } catch {
        // Race condition — fetch the one that was just created
        thread = await db.thread.findFirst({
          where: { user1Id: u1, user2Id: u2, status: 'ACTIVE', ...(postId ? { postId } : { postId: null }) },
        })
      }

      // For exclusive posts, lock it to this thread
      if (postId) {
        const post = await db.post.findUnique({
          where: { id: postId },
          select: { coordinationMode: true },
        })
        if (post?.coordinationMode === 'EXCLUSIVE' && thread) {
          await db.post.update({
            where: { id: postId },
            data: { activeThreadId: thread.id, status: 'IN_PROGRESS' },
          })
        }
      }
    }

    return NextResponse.json({ threadId: thread!.id })
  } catch (error) {
    log.error('Handler failed', error, { route: '/api/threads POST' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

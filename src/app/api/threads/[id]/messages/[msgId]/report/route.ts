import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: { id: string; msgId: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const message = await db.message.findUnique({
      where: { id: params.msgId },
      select: { senderId: true, threadId: true, text: true, type: true },
    })

    if (!message) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (message.threadId !== params.id) return NextResponse.json({ error: 'Mismatch' }, { status: 400 })
    if (message.senderId === session.userId) return NextResponse.json({ error: 'Cannot report your own message' }, { status: 400 })

    // Create a report notification for admins
    await db.notification.create({
      data: {
        type: 'REPORT',
        userId: session.userId,
        actorId: message.senderId,
        actorName: `Message report in thread ${params.id}`,
        postTitle: `[MSG] ${message.type}: ${(message.text || '').slice(0, 100)}`,
        threadId: params.id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('report message error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

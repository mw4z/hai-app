import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { requireUserReady } from '@/lib/requireUserReady'

export async function POST(req: NextRequest, { params }: { params: { id: string; msgId: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ready = await requireUserReady(session.userId)
    if (!ready.ok) return ready.response

    const { emoji } = await req.json()
    if (!emoji) return NextResponse.json({ error: 'Emoji required' }, { status: 400 })

    const message = await db.message.findUnique({
      where: { id: params.msgId },
      select: { threadId: true, reactions: true },
    })

    if (!message) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (message.threadId !== params.id) return NextResponse.json({ error: 'Mismatch' }, { status: 400 })

    const reactions = (Array.isArray(message.reactions) ? message.reactions : []) as { emoji: string; userId: string }[]

    // Toggle: if same emoji by same user exists, remove it; otherwise add
    const existing = reactions.findIndex(r => r.userId === session.userId && r.emoji === emoji)
    if (existing >= 0) {
      reactions.splice(existing, 1)
    } else {
      // Remove any previous reaction by this user (one reaction per user)
      const prev = reactions.findIndex(r => r.userId === session.userId)
      if (prev >= 0) reactions.splice(prev, 1)
      reactions.push({ emoji, userId: session.userId })
    }

    await db.message.update({
      where: { id: params.msgId },
      data: { reactions },
    })

    return NextResponse.json({ reactions })
  } catch (error) {
    console.error('react message error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

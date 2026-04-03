import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { emoji } = await req.json()
  if (!emoji) return NextResponse.json({ error: 'Emoji required' }, { status: 400 })

  const existing = await db.pollReaction.findUnique({
    where: { pollId_userId: { pollId: params.id, userId: session.userId } },
  })

  if (existing) {
    if (existing.emoji === emoji) {
      await db.pollReaction.delete({ where: { id: existing.id } })
      return NextResponse.json({ removed: true })
    }
    await db.pollReaction.update({ where: { id: existing.id }, data: { emoji } })
    return NextResponse.json({ updated: true })
  }

  await db.pollReaction.create({ data: { pollId: params.id, userId: session.userId, emoji } })
  return NextResponse.json({ added: true })
}

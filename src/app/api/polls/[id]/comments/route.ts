import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const comments = await db.pollComment.findMany({
    where: { pollId: params.id },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })

  const enriched = await Promise.all(comments.map(async c => {
    const user = await db.user.findUnique({ where: { id: c.authorId }, select: { name: true, avatarUrl: true } })
    return { ...c, authorName: user?.name, authorAvatar: user?.avatarUrl }
  }))

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { body } = await req.json()
  if (!body?.trim() || body.trim().length < 2) {
    return NextResponse.json({ error: 'التعليق قصير' }, { status: 400 })
  }

  const comment = await db.pollComment.create({
    data: { pollId: params.id, authorId: session.userId, body: body.trim() },
  })

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { name: true, avatarUrl: true } })
  return NextResponse.json({ ...comment, authorName: user?.name, authorAvatar: user?.avatarUrl }, { status: 201 })
}

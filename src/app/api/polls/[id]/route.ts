import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

/** PATCH — Edit a poll's question / options (author or super admin only).
 *  Option TEXT can be edited anytime; the option COUNT can only change while
 *  no one has voted yet (votes reference optionIndex — changing the count
 *  would misalign them). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const poll = await db.poll.findUnique({
    where: { id: params.id },
    select: { authorId: true, options: true, _count: { select: { votes: true } } },
  })
  if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (poll.authorId !== session.userId && user?.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { question, options } = await req.json()
  const data: { question?: string; options?: string[] } = {}

  if (question !== undefined) {
    if (!question?.trim() || question.trim().length < 5) {
      return NextResponse.json({ error: 'السؤال قصير جداً' }, { status: 400 })
    }
    data.question = question.trim()
  }
  if (options !== undefined) {
    if (!Array.isArray(options)) return NextResponse.json({ error: 'الخيارات غير صالحة' }, { status: 400 })
    const clean = options.map((o: string) => (typeof o === 'string' ? o.trim() : '')).filter(Boolean)
    if (clean.length < 2 || clean.length > 6) {
      return NextResponse.json({ error: 'يجب أن يكون هناك 2-6 خيارات' }, { status: 400 })
    }
    if (clean.length !== poll.options.length && poll._count.votes > 0) {
      return NextResponse.json({ error: 'لا يمكن تغيير عدد الخيارات بعد بدء التصويت' }, { status: 409 })
    }
    data.options = clean
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'لا تغييرات' }, { status: 400 })

  const updated = await db.poll.update({
    where: { id: params.id },
    data,
    select: { id: true, question: true, options: true },
  })
  return NextResponse.json({ ok: true, poll: updated })
}

/** DELETE — Delete a poll (author or super admin only) */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const poll = await db.poll.findUnique({ where: { id: params.id }, select: { authorId: true } })
  if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (poll.authorId !== session.userId && user?.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Delete votes, comments, reactions, then poll
  await db.pollVote.deleteMany({ where: { pollId: params.id } })
  await db.pollComment.deleteMany({ where: { pollId: params.id } })
  await db.pollReaction.deleteMany({ where: { pollId: params.id } })
  await db.poll.delete({ where: { id: params.id } })

  return NextResponse.json({ success: true })
}

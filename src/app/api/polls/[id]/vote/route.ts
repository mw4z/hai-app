import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { requireUserReady } from '@/lib/requireUserReady'
import { canVote } from '@/lib/membership'

/** POST — Vote on a poll */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ready = await requireUserReady(session.userId)
  if (!ready.ok) return ready.response
  // Voting is a trust-sensitive resident-only action — VERIFIED only.
  if (ready.user.role !== 'SUPER_ADMIN' && !canVote(ready.user.membership)) {
    return NextResponse.json(
      { error: 'membership_required', message: 'هذه الميزة تتطلب تأكيد السكن داخل الحي.' },
      { status: 403 },
    )
  }

  const poll = await db.poll.findUnique({ where: { id: params.id } })
  if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (poll.status !== 'active') {
    return NextResponse.json({ error: 'التصويت مغلق' }, { status: 409 })
  }
  if (poll.expiresAt && new Date() > poll.expiresAt) {
    await db.poll.update({ where: { id: params.id }, data: { status: 'closed' } })
    return NextResponse.json({ error: 'انتهت مدة التصويت' }, { status: 409 })
  }

  const { optionIndex } = await req.json()
  if (typeof optionIndex !== 'number' || optionIndex < 0 || optionIndex >= poll.options.length) {
    return NextResponse.json({ error: 'خيار غير صالح' }, { status: 400 })
  }

  // Check if already voted
  const existing = await db.pollVote.findUnique({
    where: { pollId_userId: { pollId: params.id, userId: session.userId } },
  })
  if (existing) {
    // Update vote
    await db.pollVote.update({
      where: { id: existing.id },
      data: { optionIndex },
    })
    return NextResponse.json({ success: true, changed: true })
  }

  await db.pollVote.create({
    data: { pollId: params.id, userId: session.userId, optionIndex },
  })

  return NextResponse.json({ success: true, changed: false })
}

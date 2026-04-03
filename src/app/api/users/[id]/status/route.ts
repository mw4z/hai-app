import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Check if requester has showLastSeen enabled — if not, they can't see others'
    const me = await db.user.findUnique({
      where: { id: session.userId },
      select: { showLastSeen: true },
    })
    if (!me?.showLastSeen) {
      return NextResponse.json({ online: false, lastSeenAt: null, hidden: true })
    }

    const user = await db.user.findUnique({
      where: { id: params.id },
      select: { lastSeenAt: true, showLastSeen: true },
    })

    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // If target user disabled showLastSeen, hide their status
    if (!user.showLastSeen) {
      return NextResponse.json({ online: false, lastSeenAt: null, hidden: true })
    }

    const lastSeen = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0
    const isOnline = Date.now() - lastSeen < 2 * 60_000

    return NextResponse.json({
      online: isOnline,
      lastSeenAt: user.lastSeenAt,
      hidden: false,
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

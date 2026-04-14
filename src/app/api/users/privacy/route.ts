import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { cacheDelete } from '@/lib/cache'

// GET current privacy settings
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { showLastSeen: true, showReadReceipts: true, showGender: true },
    })

    return NextResponse.json(user)
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH update privacy settings
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { showLastSeen, showReadReceipts, showGender } = await req.json()

    const data: any = {}
    if (typeof showLastSeen === 'boolean') data.showLastSeen = showLastSeen
    if (typeof showReadReceipts === 'boolean') data.showReadReceipts = showReadReceipts
    if (typeof showGender === 'boolean') data.showGender = showGender

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No changes' }, { status: 400 })
    }

    await db.user.update({
      where: { id: session.userId },
      data,
    })

    cacheDelete(`user:${session.userId}`)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

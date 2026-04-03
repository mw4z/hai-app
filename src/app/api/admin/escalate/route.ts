import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { log } from '@/lib/logger'
import { escalateToAdmin } from '@/lib/mod-safety'

/** POST — Mod escalates a post to platform admins */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    log.api('POST', '/api/admin/escalate', session.userId)

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { role: true, name: true },
    })
    if (!user || !['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

    const { postId, reason } = body
    if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })

    const post = await db.post.findUnique({ where: { id: postId }, select: { id: true, title: true } })
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    const escalationReason = reason?.trim()
      ? `${user.name || 'Mod'}: ${reason.trim()}`
      : `${user.name || 'Mod'} escalated post "${post.title?.slice(0, 40)}"`

    const result = await escalateToAdmin(session.userId, postId, escalationReason)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 429 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('Escalation failed', error, { route: '/api/admin/escalate' })
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 })
  }
}

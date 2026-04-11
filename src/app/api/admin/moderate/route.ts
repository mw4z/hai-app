import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

const ADMIN_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']

async function requireAdmin(session: { userId: string }) {
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, gender: true },
  })
  if (!user || !ADMIN_ROLES.includes(user.role)) return null
  return user
}

// POST /api/admin/moderate
// Actions: hide_post, remove_post, restore_post, ban_user, unban_user
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await requireAdmin(session)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { action, postId, userId, banType } = await req.json()

  // Male mods cannot act on WOMEN_ONLY posts — route to female mods only
  if (postId && admin.gender !== 'FEMALE') {
    const post = await db.post.findUnique({ where: { id: postId }, select: { category: true } })
    if (post?.category === 'WOMEN_ONLY') {
      return NextResponse.json({ error: 'هذا المنشور مخصص للمشرفات فقط' }, { status: 403 })
    }
  }

  switch (action) {
    case 'hide_post': {
      if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })
      await db.post.update({ where: { id: postId }, data: { status: 'HIDDEN' } })
      return NextResponse.json({ success: true })
    }

    case 'remove_post': {
      if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })
      await db.post.update({ where: { id: postId }, data: { status: 'REMOVED' } })
      return NextResponse.json({ success: true })
    }

    case 'restore_post': {
      if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })
      await db.post.update({ where: { id: postId }, data: { status: 'ACTIVE' } })
      return NextResponse.json({ success: true })
    }

    case 'ban_user': {
      if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
      const status = banType === 'permanent' ? 'BANNED_PERM' : 'BANNED_TEMP'
      await db.user.update({ where: { id: userId }, data: { status } })
      return NextResponse.json({ success: true })
    }

    case 'unban_user': {
      if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
      await db.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } })
      return NextResponse.json({ success: true })
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { logModAction, assertModConflictFree } from '@/lib/modAudit'

const ADMIN_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']

async function requireAdmin(session: { userId: string }) {
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, gender: true, modStatus: true, neighborhoodId: true },
  })
  if (!user || !ADMIN_ROLES.includes(user.role)) return null
  // Suspended neighborhood mods keep the role but cannot act.
  if (user.role === 'NEIGHBORHOOD_MOD' && user.modStatus === 'SUSPENDED') return null
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

  // Male mods cannot act on WOMEN-audience posts — route to female mods
  // only. Audience targeting now lives on Post.audience instead of the
  // legacy WOMEN_ONLY category.
  if (postId && admin.gender !== 'FEMALE') {
    const post = await db.post.findUnique({ where: { id: postId }, select: { audience: true } })
    if (post?.audience === 'WOMEN') {
      return NextResponse.json({ error: 'هذا المنشور مخصص للمشرفات فقط' }, { status: 403 })
    }
  }

  // Conflict-of-interest: neighborhood mods cannot act on their own
  // posts or on users with whom they have a block relationship.
  if (postId) {
    const conflict = await assertModConflictFree({
      moderatorId: admin.id,
      moderatorRole: admin.role,
      targetType: 'post',
      targetId: postId,
    })
    if (conflict) {
      return NextResponse.json({ error: 'conflict_of_interest', reason: conflict }, { status: 403 })
    }
  }
  if (userId) {
    const conflict = await assertModConflictFree({
      moderatorId: admin.id,
      moderatorRole: admin.role,
      targetType: 'user',
      targetId: userId,
      subjectUserId: userId,
    })
    if (conflict) {
      return NextResponse.json({ error: 'conflict_of_interest', reason: conflict }, { status: 403 })
    }
  }

  switch (action) {
    case 'hide_post': {
      if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })
      await db.post.update({ where: { id: postId }, data: { status: 'HIDDEN' } })
      logModAction({ moderatorId: admin.id, actionType: 'hide_post', targetType: 'post', targetId: postId })
      return NextResponse.json({ success: true })
    }

    case 'remove_post': {
      if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })
      await db.post.update({ where: { id: postId }, data: { status: 'REMOVED' } })
      logModAction({ moderatorId: admin.id, actionType: 'remove_post', targetType: 'post', targetId: postId })
      return NextResponse.json({ success: true })
    }

    case 'restore_post': {
      if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })
      await db.post.update({ where: { id: postId }, data: { status: 'ACTIVE' } })
      logModAction({ moderatorId: admin.id, actionType: 'restore_post', targetType: 'post', targetId: postId })
      return NextResponse.json({ success: true })
    }

    case 'ban_user': {
      if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
      const status = banType === 'permanent' ? 'BANNED_PERM' : 'BANNED_TEMP'
      await db.user.update({ where: { id: userId }, data: { status } })
      logModAction({ moderatorId: admin.id, actionType: 'ban_user', targetType: 'user', targetId: userId, details: `banType=${banType || 'temp'}` })
      return NextResponse.json({ success: true })
    }

    case 'unban_user': {
      if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
      await db.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } })
      logModAction({ moderatorId: admin.id, actionType: 'unban_user', targetType: 'user', targetId: userId })
      return NextResponse.json({ success: true })
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}

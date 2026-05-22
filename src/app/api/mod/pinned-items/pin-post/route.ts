import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canManageInNeighborhood, expiryFromDuration, type PinDuration } from '@/lib/pinnedItems/pinnedItems'
import { logPinnedAudit } from '@/lib/pinnedItems/audit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/mod/pinned-items/pin-post  { postId, duration }
 *
 * Convenience pin from a post's menu: resolves the post's neighborhood and
 * auto-fills title/summary server-side (no manual entry — the mod only
 * picks a duration). Goes to the المثبتات / Pinned Items section (NOT the
 * stars/highlights). Dedupes by source so re-pinning refreshes. The post
 * itself is never modified.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true, neighborhoodId: true } })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const postId = typeof body?.postId === 'string' ? body.postId : ''
  const duration: PinDuration = ['24h', '7d', '30d', 'forever', 'custom'].includes(body?.duration) ? body.duration : 'forever'
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })

  const post = await db.post.findUnique({
    where: { id: postId },
    select: { id: true, neighborhoodId: true, title: true, body: true, status: true },
  })
  if (!post) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  // Can't pin moderation-removed/hidden content.
  if (post.status === 'REMOVED' || post.status === 'HIDDEN') {
    return NextResponse.json({ error: 'لا يمكن تثبيت منشور محذوف' }, { status: 409 })
  }
  if (!canManageInNeighborhood(user.role, user.neighborhoodId, post.neighborhoodId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const title = (post.title?.trim() || post.body?.trim() || '').slice(0, 200) || 'منشور مثبّت'
  const summary = post.body?.trim() ? post.body.trim().slice(0, 280) : null
  const expiresAt = expiryFromDuration(duration)

  const existing = await db.neighborhoodPinnedItem.findUnique({
    where: { neighborhoodId_sourceType_sourceId: { neighborhoodId: post.neighborhoodId, sourceType: 'post', sourceId: post.id } },
    select: { id: true },
  })
  if (existing) {
    await db.neighborhoodPinnedItem.update({
      where: { id: existing.id },
      data: { title, summary, expiresAt, status: 'ACTIVE', hiddenAt: null, hiddenById: null, hiddenReason: null },
    })
    await logPinnedAudit({ pinnedItemId: existing.id, actorId: user.id, action: 'UPDATE', newValue: { title, expiresAt, reactivated: true, from: 'post-menu' } })
    return NextResponse.json({ ok: true, id: existing.id, deduped: true })
  }

  const created = await db.neighborhoodPinnedItem.create({
    data: {
      neighborhoodId: post.neighborhoodId, type: 'POST', sourceType: 'post', sourceId: post.id,
      title, summary, expiresAt, status: 'ACTIVE', pinnedById: user.id,
    },
    select: { id: true },
  })
  await logPinnedAudit({ pinnedItemId: created.id, actorId: user.id, action: 'PIN', newValue: { type: 'POST', sourceId: post.id, title, expiresAt, from: 'post-menu' } })
  return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
}

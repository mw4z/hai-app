import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { cacheDeletePrefix } from '@/lib/cache'
import { logModAction } from '@/lib/modAudit'
import {
  PostCategory,
  PostIntent,
  MarketplaceType,
  PostPriority,
} from '@prisma/client'

const VALID_CATEGORIES = Object.values(PostCategory)
const VALID_INTENTS: PostIntent[] = ['OFFER', 'REQUEST', 'NORMAL']
const VALID_MARKETPLACE_TYPES: MarketplaceType[] = ['SELL', 'BUY', 'JOB']
const ADMIN_ROLES = new Set(['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN'])

/**
 * PATCH /api/posts/:id/category
 *
 * Manual mod / admin override for a post's routing fields. Bypasses
 * the deterministic classifier — this endpoint is "I know what the
 * right category is, just move it." Used for edge cases the keyword
 * classifier misses.
 *
 * Body (partial — only fields you want to change):
 *   { category?, intent?, marketplaceType? }
 *
 * Auth:
 *   - Session required.
 *   - Role must be NEIGHBORHOOD_MOD / PLATFORM_MOD / SUPER_ADMIN.
 *   - NEIGHBORHOOD_MOD restricted to posts in their own neighborhood.
 *
 * Hard rules (preserved):
 *   - Priority is NOT editable here. Re-classification cannot escalate
 *     a post to HIGH/CRITICAL — that's the abuse vector this whole
 *     subsystem exists to prevent.
 *   - If category leaves MARKETPLACE, marketplaceType is forced to SELL
 *     (matches the schema default and DB invariant).
 *   - If category enters MARKETPLACE without a marketplaceType in the
 *     body, the existing value is preserved (or defaults to SELL).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true, modStatus: true, name: true },
  })
  if (!me || !ADMIN_ROLES.has(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (me.role === 'NEIGHBORHOOD_MOD' && me.modStatus === 'SUSPENDED') {
    return NextResponse.json({ error: 'Mod suspended' }, { status: 403 })
  }

  let body: { category?: string; intent?: string; marketplaceType?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate each field (only the ones provided).
  const data: {
    category?: PostCategory
    intent?: PostIntent
    marketplaceType?: MarketplaceType
  } = {}
  if (body.category !== undefined) {
    if (!(VALID_CATEGORIES as readonly string[]).includes(body.category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }
    data.category = body.category as PostCategory
  }
  if (body.intent !== undefined) {
    if (!(VALID_INTENTS as readonly string[]).includes(body.intent)) {
      return NextResponse.json({ error: 'Invalid intent' }, { status: 400 })
    }
    data.intent = body.intent as PostIntent
  }
  if (body.marketplaceType !== undefined) {
    if (!(VALID_MARKETPLACE_TYPES as readonly string[]).includes(body.marketplaceType)) {
      return NextResponse.json({ error: 'Invalid marketplaceType' }, { status: 400 })
    }
    data.marketplaceType = body.marketplaceType as MarketplaceType
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const post = await db.post.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      category: true,
      intent: true,
      marketplaceType: true,
      priority: true,
      neighborhoodId: true,
      authorId: true,
    },
  })
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // NEIGHBORHOOD_MOD scoping.
  if (me.role === 'NEIGHBORHOOD_MOD' && me.neighborhoodId !== post.neighborhoodId) {
    return NextResponse.json({ error: 'Out of jurisdiction' }, { status: 403 })
  }

  // Resolve final values for the row write — preserving the
  // category↔marketplaceType invariant.
  const finalCategory: PostCategory = data.category ?? post.category
  const finalIntent: PostIntent = data.intent ?? post.intent
  let finalMarketplaceType: MarketplaceType =
    data.marketplaceType ?? post.marketplaceType
  if (finalCategory !== 'MARKETPLACE') finalMarketplaceType = 'SELL'

  // Priority clamp — moderators CAN'T promote a post to HIGH/CRITICAL
  // via this endpoint. If the post's current priority is HIGH and the
  // category change wouldn't justify it, we downgrade to NORMAL.
  // (HIGH is auto-set by classifyPost for LOST_FOUND / NEIGHBORHOOD_REPORTS.)
  const PRIORITY_AUTO_HIGH: ReadonlySet<PostCategory> = new Set<PostCategory>([
    'LOST_FOUND',
    'NEIGHBORHOOD_REPORTS',
  ])
  let finalPriority: PostPriority = post.priority
  if (
    finalPriority === 'HIGH' &&
    !PRIORITY_AUTO_HIGH.has(finalCategory) &&
    me.role !== 'PLATFORM_MOD' &&
    me.role !== 'SUPER_ADMIN'
  ) {
    finalPriority = 'NORMAL'
  }
  // CRITICAL on mod re-categorization is never preserved unless the
  // editor is platform-level — extra safety.
  if (finalPriority === 'CRITICAL' && me.role !== 'PLATFORM_MOD' && me.role !== 'SUPER_ADMIN') {
    finalPriority = 'NORMAL'
  }

  const now = new Date()
  await db.post.update({
    where: { id: post.id },
    data: {
      category:        finalCategory,
      intent:          finalIntent,
      marketplaceType: finalMarketplaceType,
      priority:        finalPriority,
      categoryEditedById: me.id,
      categoryEditedAt:   now,
    },
  })

  // Audit log (NEIGHBORHOOD_MOD trail) + general moderation log row.
  await logModAction({
    moderatorId: me.id,
    actionType: 'edit_category',
    targetType: 'post',
    targetId: post.id,
    neighborhoodId: post.neighborhoodId,
    details: JSON.stringify({
      from: { category: post.category, intent: post.intent, marketplaceType: post.marketplaceType, priority: post.priority },
      to:   { category: finalCategory,  intent: finalIntent,  marketplaceType: finalMarketplaceType, priority: finalPriority },
    }),
  })
  await db.moderationLog.create({
    data: {
      adminId: me.id,
      adminName: me.name,
      action: 'edit_category',
      targetType: 'post',
      targetId: post.id,
      details: `${post.category}/${post.intent}/${post.marketplaceType} → ${finalCategory}/${finalIntent}/${finalMarketplaceType}`,
    },
  }).catch(() => { /* best-effort audit; never block the action */ })

  // Invalidate the feed cache so the move is visible immediately.
  cacheDeletePrefix(`feed:${post.neighborhoodId}`)
  cacheDeletePrefix(`market:${post.neighborhoodId}`)

  return NextResponse.json({
    success: true,
    category:        finalCategory,
    intent:          finalIntent,
    marketplaceType: finalMarketplaceType,
    priority:        finalPriority,
    editedAt:        now.toISOString(),
  })
}

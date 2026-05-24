/**
 * Safe internal post-creation for the WhatsApp bridge. Reuses the same
 * classifier (classifyPost) + profanity gate (moderateContent) as the
 * normal flow, then HARD-CONSTRAINS the result:
 *   - intent is always REQUEST
 *   - category limited to SERVICES / GENERAL / LOST_FOUND
 *   - priority forced NORMAL (never HIGH/CRITICAL)
 *   - no marketplaceType, no offer, no audience targeting
 *   - origin = WHATSAPP_BRIDGE, authored by the system bridge user
 * Anything outside the allowlist is rejected — the bridge can't be coerced
 * into emergencies, ads, polls, or raised priority.
 */
import { db } from '@/lib/db'
import { classifyPost } from '@/lib/posts/classifyPost'
import { moderateContent } from '@/lib/moderation'
import type { BridgeCategory } from './classify'

const ALLOWED: ReadonlySet<BridgeCategory> = new Set<BridgeCategory>(['SERVICES', 'GENERAL', 'LOST_FOUND'])

export type BridgePostResult =
  | { ok: true; postId: string; status: string }
  | { ok: false; reason: string }

export async function createBridgePost(input: {
  text: string
  category: BridgeCategory
  neighborhoodId: string
  systemUserId: string | null
  reviewFirst: boolean
}): Promise<BridgePostResult> {
  if (!input.systemUserId) return { ok: false, reason: 'no_system_user' }
  if (!ALLOWED.has(input.category)) return { ok: false, reason: 'category_not_allowed' }

  const text = (input.text || '').trim()
  if (text.length < 3) return { ok: false, reason: 'too_short' }

  // Same profanity gate as the normal flow. block → don't publish.
  const mod = moderateContent(text)
  if (mod.action === 'block') return { ok: false, reason: 'blocked_content' }

  // Reuse the shared classifier for category/intent/audience consistency,
  // but FORCE intent=REQUEST and priority=NORMAL regardless of what it
  // returns (bridge never raises priority).
  const c = classifyPost({ category: input.category, intent: 'REQUEST' })

  try {
    const post = await db.post.create({
      data: {
        title: '', // REQUEST in these categories doesn't require a title
        body: mod.censored,
        category: c.category,
        intent: 'REQUEST',
        priority: 'NORMAL',
        audience: 'ALL',
        authorId: input.systemUserId,
        neighborhoodId: input.neighborhoodId,
        origin: 'WHATSAPP_BRIDGE',
        originScope: 'RESIDENT',
        status: input.reviewFirst ? 'HIDDEN' : 'ACTIVE',
      },
      select: { id: true, status: true },
    })
    return { ok: true, postId: post.id, status: post.status }
  } catch (err) {
    console.error('[BRIDGE] post create failed', err)
    return { ok: false, reason: 'create_failed' }
  }
}

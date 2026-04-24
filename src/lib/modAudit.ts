import { db } from '@/lib/db'

/**
 * Audit + counter update for every NEIGHBORHOOD_MOD privileged action.
 *
 * - Writes a ModActionLog row (authoritative trail)
 * - Bumps the mod's modActionsCount + lastModActionAt so the
 *   inactivity sweep has cheap data to read without aggregating logs
 * - If the mod's modStatus had been flipped to INACTIVE/UNDER_REVIEW
 *   purely due to inactivity, a fresh action re-activates them
 *   (INACTIVE → ACTIVE). UNDER_REVIEW and SUSPENDED require explicit
 *   admin resolution and are NOT auto-cleared here.
 *
 * Safe to call fire-and-forget: it never throws — all errors log and
 * swallow so a logging failure never blocks the underlying mod action.
 *
 * SUPER_ADMIN and PLATFORM_MOD actions are intentionally NOT tracked
 * here — this table exists to surface neighborhood-mod behavior for
 * residents to judge, and platform roles have their own ModerationLog.
 */
export async function logModAction(opts: {
  moderatorId: string
  actionType: string
  targetType: string
  targetId: string
  neighborhoodId?: string | null
  details?: string | null
}) {
  const { moderatorId, actionType, targetType, targetId } = opts
  try {
    // Only track NEIGHBORHOOD_MOD. Platform-level admins use
    // ModerationLog which is already being written elsewhere.
    const mod = await db.user.findUnique({
      where: { id: moderatorId },
      select: { role: true, modStatus: true, neighborhoodId: true },
    })
    if (!mod || mod.role !== 'NEIGHBORHOOD_MOD') return

    const neighborhoodId = opts.neighborhoodId ?? mod.neighborhoodId ?? null

    await db.modActionLog.create({
      data: {
        moderatorId,
        actionType,
        targetType,
        targetId,
        neighborhoodId,
        details: opts.details ?? null,
      },
    })

    const shouldReactivate = mod.modStatus === 'INACTIVE'
    await db.user.update({
      where: { id: moderatorId },
      data: {
        lastModActionAt: new Date(),
        modActionsCount: { increment: 1 },
        ...(shouldReactivate ? { modStatus: 'ACTIVE' as const } : {}),
      },
    })
  } catch (err) {
    console.error('[MOD_AUDIT] failed', { moderatorId, actionType, targetType, targetId, err })
  }
}

/**
 * Conflict-of-interest guard for neighborhood mods. Returns a reason
 * code when the mod MUST NOT act on the given target, null otherwise.
 *
 * Rules:
 *  - A mod cannot act on a post they authored (self-moderation).
 *  - A mod cannot act on a user they've blocked, or a user who has
 *    blocked them (poisoned well — bias presumed).
 *
 * SUPER_ADMIN / PLATFORM_MOD bypass this check.
 */
export async function assertModConflictFree(opts: {
  moderatorId: string
  moderatorRole: string
  targetType: 'post' | 'user' | 'comment' | 'user_report'
  targetId: string
  // For user_report actions, pass reportedUserId so we check the
  // actual subject, not the report row id.
  subjectUserId?: string | null
}): Promise<string | null> {
  const { moderatorId, moderatorRole, targetType, targetId } = opts
  if (moderatorRole === 'SUPER_ADMIN' || moderatorRole === 'PLATFORM_MOD') return null
  if (moderatorRole !== 'NEIGHBORHOOD_MOD') return null

  let subjectUserId = opts.subjectUserId ?? null

  if (targetType === 'post') {
    const post = await db.post.findUnique({
      where: { id: targetId },
      select: { authorId: true },
    })
    if (!post) return null
    if (post.authorId === moderatorId) return 'own_post'
    subjectUserId = subjectUserId || post.authorId
  } else if (targetType === 'comment') {
    const comment = await db.comment.findUnique({
      where: { id: targetId },
      select: { authorId: true },
    })
    if (!comment) return null
    if (comment.authorId === moderatorId) return 'own_comment'
    subjectUserId = subjectUserId || comment.authorId
  } else if (targetType === 'user' && !subjectUserId) {
    subjectUserId = targetId
  }

  if (subjectUserId && subjectUserId === moderatorId) return 'own_account'

  if (subjectUserId) {
    const block = await db.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: moderatorId, blockedId: subjectUserId },
          { blockerId: subjectUserId, blockedId: moderatorId },
        ],
      },
      select: { id: true },
    })
    if (block) return 'blocked_relationship'
  }

  return null
}

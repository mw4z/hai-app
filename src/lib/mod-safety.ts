import { db } from '@/lib/db'
import { log } from '@/lib/logger'

// ─── Constants ──────────────────────────────────────────────────────────────

const DAILY_REP_CAP = 10            // Max rep a mod can earn per day from actions
const PROBATION_HOURS = 48          // New mods are on probation for 48h
const HOURLY_ACTION_LIMIT = 15      // Max mod actions per hour (abuse detection)
const SUSPICIOUS_HIDE_RATIO = 0.7   // If >70% hides have no reports → suspicious

// ─── Probation ──────────────────────────────────────────────────────────────

/** Check if a mod is still on probation (first 48 hours) */
export function isOnProbation(modApprovedAt: Date | null): boolean {
  if (!modApprovedAt) return false
  const elapsed = Date.now() - new Date(modApprovedAt).getTime()
  return elapsed < PROBATION_HOURS * 60 * 60 * 1000
}

// Actions permanently restricted from NEIGHBORHOOD_MOD (regardless of probation)
const NEIGHBORHOOD_MOD_BLOCKED: Record<string, string> = {
  ban_user: 'الحظر الدائم متاح فقط لمشرفي المنصة / Permanent ban is restricted to platform mods',
  remove_post: 'حذف المنشورات نهائياً متاح فقط لمشرفي المنصة / Permanent removal is restricted to platform mods',
  delete_user: 'حذف المستخدمين متاح فقط لمشرفي المنصة / User deletion is restricted to platform mods',
}

/** Check NEIGHBORHOOD_MOD scope restrictions + probation */
export function getModRestrictions(action: string, onProbation: boolean): { allowed: boolean; reason?: string } {
  // Permanent scope block — these never unlock for neighborhood mods
  const blocked = NEIGHBORHOOD_MOD_BLOCKED[action]
  if (blocked) {
    return { allowed: false, reason: blocked }
  }

  // Probation-only restrictions (first 48h)
  // Currently none beyond the permanent blocks above,
  // but kept as a hook for future tightening if needed.

  return { allowed: true }
}

// ─── Conflict of Interest Detection ─────────────────────────────────────────

const CONFLICT_BLOCKED_ACTIONS = new Set([
  'hide_post', 'restore_post', 'temp_ban_user', 'dismiss_reports',
])

// 7-day recency window for chat and competitor checks
const RECENCY_MS = 7 * 24 * 60 * 60 * 1000
const COMPETITIVE_CATEGORIES = new Set(['SERVICES', 'FOOD_HOME', 'MARKETPLACE', 'REAL_ESTATE'])
const MAX_ESCALATIONS_PER_HOUR = 5

/*
 * Conflict reasons (standardized):
 *   own_post           — mod owns the target post
 *   recent_chat        — mod has recent chat with post author / target user
 *   commented          — mod commented on the target post
 *   recent_competitor  — mod has active post in same competitive category (last 7d)
 *   reported_by_mod    — mod personally reported this post
 *   self_target        — mod targeting themselves
 */

interface ConflictResult {
  hasConflict: boolean
  reason?: string
}

/**
 * Detect conflict of interest for a NEIGHBORHOOD_MOD.
 * All checks are deterministic, lightweight, and use a 7-day recency window
 * for chat and competitor checks to avoid over-blocking.
 */
export async function checkConflictOfInterest(
  modId: string,
  action: string,
  targetId: string,
  targetType: 'post' | 'user',
): Promise<ConflictResult> {
  if (!CONFLICT_BLOCKED_ACTIONS.has(action)) return { hasConflict: false }

  const recentCutoff = new Date(Date.now() - RECENCY_MS)

  if (targetType === 'post') {
    const post = await db.post.findUnique({
      where: { id: targetId },
      select: { authorId: true, category: true, neighborhoodId: true },
    })
    if (!post) return { hasConflict: false }

    // 1) Mod owns the post
    if (post.authorId === modId) {
      return { hasConflict: true, reason: 'own_post' }
    }

    // 2) Mod reported this post
    const modReported = await db.report.findFirst({
      where: { reporterId: modId, postId: targetId },
      select: { id: true },
    })
    if (modReported) {
      return { hasConflict: true, reason: 'reported_by_mod' }
    }

    // 3) Mod has RECENT chat with post author (message within 7 days)
    const recentThread = await db.thread.findFirst({
      where: {
        OR: [
          { user1Id: modId, user2Id: post.authorId },
          { user1Id: post.authorId, user2Id: modId },
        ],
        updatedAt: { gte: recentCutoff },
      },
      select: { id: true },
    })
    if (recentThread) {
      return { hasConflict: true, reason: 'recent_chat' }
    }

    // 4) Mod commented on this post
    const hasComment = await db.comment.findFirst({
      where: { postId: targetId, authorId: modId },
      select: { id: true },
    })
    if (hasComment) {
      return { hasConflict: true, reason: 'commented' }
    }

    // 5) Competitor: same category + same neighborhood + both recent (7d)
    if (COMPETITIVE_CATEGORIES.has(post.category)) {
      const modCompetingPost = await db.post.findFirst({
        where: {
          authorId: modId,
          category: post.category,
          neighborhoodId: post.neighborhoodId,
          status: 'ACTIVE',
          createdAt: { gte: recentCutoff },
        },
        select: { id: true },
      })
      if (modCompetingPost) {
        return { hasConflict: true, reason: 'recent_competitor' }
      }
    }
  }

  if (targetType === 'user') {
    // Self-moderation
    if (targetId === modId) {
      return { hasConflict: true, reason: 'self_target' }
    }

    // Recent chat with target user (7d)
    const recentThread = await db.thread.findFirst({
      where: {
        OR: [
          { user1Id: modId, user2Id: targetId },
          { user1Id: targetId, user2Id: modId },
        ],
        updatedAt: { gte: recentCutoff },
      },
      select: { id: true },
    })
    if (recentThread) {
      return { hasConflict: true, reason: 'recent_chat' }
    }
  }

  return { hasConflict: false }
}

/** Log a blocked conflict-of-interest attempt */
export async function logConflictBlock(modId: string, action: string, targetId: string, reason: string) {
  log.warn('MOD_CONFLICT_BLOCKED', {
    route: 'mod-safety',
    userId: modId,
    action,
    targetId,
    conflictReason: reason,
  })

  await db.moderationLog.create({
    data: {
      adminId: modId,
      action: 'CONFLICT_BLOCKED',
      targetType: 'conflict',
      targetId,
      reason: `${action} blocked: ${reason}`,
      details: JSON.stringify({ attemptedAction: action, conflictReason: reason }),
    },
  }).catch(() => {})
}

/** Escalate a post to SUPER_ADMIN / PLATFORM_MOD review (with abuse guard) */
export async function escalateToAdmin(modId: string, targetId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  // Prevent duplicate escalation for same post by same mod
  const existing = await db.moderationLog.findFirst({
    where: { adminId: modId, action: 'ESCALATE', targetId },
    select: { id: true },
  })
  if (existing) {
    return { ok: false, error: 'تم تصعيد هذا المنشور مسبقاً / Already escalated' }
  }

  // Rate limit: max 5 escalations per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const recentCount = await db.moderationLog.count({
    where: { adminId: modId, action: 'ESCALATE', createdAt: { gte: oneHourAgo } },
  })
  if (recentCount >= MAX_ESCALATIONS_PER_HOUR) {
    return { ok: false, error: 'تجاوزت الحد الأقصى للتصعيدات في الساعة / Hourly escalation limit reached' }
  }

  const modUser = await db.user.findUnique({ where: { id: modId }, select: { name: true, lastName: true } })
  const modUserFullName = [modUser?.name?.trim(), modUser?.lastName?.trim()].filter(Boolean).join(' ') || modUser?.name

  const admins = await db.user.findMany({
    where: { role: { in: ['SUPER_ADMIN', 'PLATFORM_MOD'] } },
    select: { id: true },
  })

  for (const admin of admins) {
    await db.notification.create({
      data: {
        userId: admin.id,
        actorId: modId,
        actorName: modUserFullName,
        type: 'SYSTEM',
        title: 'تصعيد من مشرف حي',
        titleEn: 'Escalation from Neighborhood Mod',
        body: reason,
        bodyEn: reason,
        postId: targetId,
      },
    }).catch(() => {})
  }

  await db.moderationLog.create({
    data: {
      adminId: modId,
      adminName: modUserFullName,
      action: 'ESCALATE',
      targetType: 'post',
      targetId,
      reason,
    },
  })

  log.info('Post escalated to admin', { route: 'mod-safety', userId: modId, targetId, reason })
  return { ok: true }
}

// ─── Reputation Validation ──────────────────────────────────────────────────

/** Check if a mod action deserves reputation reward */
export async function validateRepReward(
  adminId: string,
  action: string,
  targetId: string,
  baseReward: number,
): Promise<number> {
  // 1) Check daily cap
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const todayLogs = await db.moderationLog.findMany({
    where: { adminId, createdAt: { gte: startOfDay } },
    select: { action: true },
  })

  // Calculate today's earned rep
  const REP_MAP: Record<string, number> = {
    hide_post: 2, restore_post: 1, review_reports: 2, dismiss_reports: 1,
    ban_user: 3, temp_ban_user: 2, unban_user: 1, reply_neighborhood_report: 2, reply_ticket: 2,
  }
  const todayRep = todayLogs.reduce((sum, l) => sum + (REP_MAP[l.action] || 0), 0)

  if (todayRep >= DAILY_REP_CAP) {
    log.info('Mod rep daily cap reached', { route: 'mod-safety', userId: adminId, todayRep })
    return 0
  }

  // 2) Validate the action is legitimate
  if (action === 'hide_post') {
    // Only reward if post actually has reports
    const post = await db.post.findUnique({ where: { id: targetId }, select: { reportCount: true } })
    if (!post || post.reportCount === 0) {
      log.warn('Mod hide without reports — no rep reward', { route: 'mod-safety', userId: adminId, targetId })
      return 0
    }
  }

  if (action === 'ban_user' || action === 'temp_ban_user') {
    // Only reward if target user has been reported
    const reports = await db.report.count({ where: { reportedUserId: targetId } })
    if (reports === 0) {
      log.warn('Mod ban without reports — no rep reward', { route: 'mod-safety', userId: adminId, targetId })
      return 0
    }
  }

  // Cap reward to not exceed daily limit
  const remaining = DAILY_REP_CAP - todayRep
  return Math.min(baseReward, remaining)
}

// ─── Action Rate Monitoring ─────────────────────────────────────────────────

/** Check if mod is acting suspiciously fast */
export async function checkActionRate(adminId: string): Promise<{ ok: boolean; warning?: string }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

  const recentActions = await db.moderationLog.count({
    where: { adminId, createdAt: { gte: oneHourAgo } },
  })

  if (recentActions >= HOURLY_ACTION_LIMIT) {
    log.warn('Mod action rate limit exceeded', { route: 'mod-safety', userId: adminId, count: recentActions })
    return { ok: false, warning: 'تجاوزت الحد الأقصى للإجراءات في الساعة / Hourly action limit reached' }
  }

  // Check hide-without-report ratio
  if (recentActions >= 5) {
    const recentHides = await db.moderationLog.count({
      where: { adminId, action: 'hide_post', createdAt: { gte: oneHourAgo } },
    })
    if (recentHides > 0) {
      // Of those hides, how many target posts had reports?
      const hideLogs = await db.moderationLog.findMany({
        where: { adminId, action: 'hide_post', createdAt: { gte: oneHourAgo } },
        select: { targetId: true },
      })
      let withReports = 0
      for (const h of hideLogs) {
        const post = await db.post.findUnique({ where: { id: h.targetId }, select: { reportCount: true } })
        if (post && post.reportCount > 0) withReports++
      }
      const ratio = 1 - (withReports / hideLogs.length)
      if (ratio > SUSPICIOUS_HIDE_RATIO) {
        log.warn('Suspicious mod hide pattern', { route: 'mod-safety', userId: adminId, hidesWithoutReports: ratio })
      }
    }
  }

  return { ok: true }
}

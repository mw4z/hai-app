import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { log } from '@/lib/logger'
import { isOnProbation, getModRestrictions, validateRepReward, checkActionRate, checkConflictOfInterest, logConflictBlock } from '@/lib/mod-safety'
import { sendSupportReply, sendAdminEmail } from '@/lib/email'
import { kickNotifCron } from '@/lib/kickNotifCron'
import { cleanupNotificationsFor } from '@/lib/notifications'

const ADMIN_ROLES = ['NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']

// Mod action rep (aligned with new trust-based system)
// Low: 0–1, Medium: 2, High: 3 — capped at +10/day via mod-safety
const MOD_ACTION_REP: Record<string, number> = {
  hide_post: 1,              // was 2 — only rewarded if post has reports
  restore_post: 1,
  review_reports: 1,         // was 2
  dismiss_reports: 0,        // was 1 — dismissing is not effort
  ban_user: 2,               // was 3 — only rewarded if user has reports
  temp_ban_user: 1,          // was 2
  unban_user: 0,             // was 1 — undoing is not effort
  reply_neighborhood_report: 2,
  reply_ticket: 2,
}

async function logAction(adminId: string, adminName: string | null, action: string, targetType: string, targetId: string, reason?: string, details?: string) {
  await db.moderationLog.create({
    data: { adminId, adminName, action, targetType, targetId, reason, details },
  })

  // Award validated reputation (daily cap + legitimacy check)
  const baseReward = MOD_ACTION_REP[action]
  if (baseReward) {
    try {
      const reward = await validateRepReward(adminId, action, targetId, baseReward)
      if (reward > 0) {
        await db.user.update({
          where: { id: adminId },
          data: { reputation: { increment: reward } },
        })
      }
    } catch (err) {
      log.error('Rep reward validation failed', err, { route: 'admin/action', userId: adminId })
    }
  }
}

/** Check if a neighborhood mod has authority over a post */
async function canModeratePost(admin: { role: string; neighborhoodId: string | null }, postId: string): Promise<boolean> {
  if (admin.role === 'SUPER_ADMIN') return true
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { neighborhoodId: true, author: { select: { role: true } } },
  })
  if (!post) return false
  // Can't moderate posts by higher-role admins
  if (['SUPER_ADMIN', 'PLATFORM_MOD'].includes(post.author.role) && admin.role !== 'SUPER_ADMIN') return false
  if (admin.role === 'PLATFORM_MOD') return true
  if (admin.role === 'NEIGHBORHOOD_MOD' && admin.neighborhoodId) {
    return post.neighborhoodId === admin.neighborhoodId
  }
  return false
}

/** Check if a neighborhood mod has authority over a user */
async function canModerateUser(admin: { role: string; neighborhoodId: string | null }, userId: string): Promise<boolean> {
  if (admin.role === 'SUPER_ADMIN') return true
  // Check target user's role — no one except SUPER_ADMIN can moderate admins
  const target = await db.user.findUnique({ where: { id: userId }, select: { neighborhoodId: true, role: true } })
  if (!target) return false
  if (['SUPER_ADMIN', 'PLATFORM_MOD', 'NEIGHBORHOOD_MOD'].includes(target.role) && admin.role !== 'SUPER_ADMIN') {
    return false // only SUPER_ADMIN can touch other admins
  }
  if (admin.role === 'PLATFORM_MOD') return true
  if (admin.role === 'NEIGHBORHOOD_MOD' && admin.neighborhoodId) {
    return target.neighborhoodId === admin.neighborhoodId
  }
  return false
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, name: true, lastName: true, neighborhoodId: true, modApprovedAt: true },
  })
  if (!admin || !ADMIN_ROLES.includes(admin.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { action, targetId, reason } = body
  if (!action || !targetId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const isSuper = admin.role === 'SUPER_ADMIN'

  // ── Safety: scope + probation restrictions (NEIGHBORHOOD_MOD only) ───────
  if (admin.role === 'NEIGHBORHOOD_MOD') {
    const onProbation = isOnProbation(admin.modApprovedAt)
    const restriction = getModRestrictions(action, onProbation)
    if (!restriction.allowed) {
      return NextResponse.json({ error: restriction.reason }, { status: 403 })
    }

    // Rate limit check
    const rateCheck = await checkActionRate(session.userId)
    if (!rateCheck.ok) {
      return NextResponse.json({ error: rateCheck.warning }, { status: 429 })
    }

    // Conflict of interest check
    const targetType = ['hide_post', 'restore_post', 'dismiss_reports', 'review_reports'].includes(action) ? 'post' as const : 'user' as const
    const conflict = await checkConflictOfInterest(session.userId, action, targetId, targetType)
    if (conflict.hasConflict) {
      await logConflictBlock(session.userId, action, targetId, conflict.reason!)
      return NextResponse.json({
        error: 'لا يمكنك تنفيذ هذا الإجراء بسبب تعارض مصالح — يمكنك تصعيده للمشرف الأعلى / Action blocked due to conflict of interest — you can escalate instead',
        conflictReason: conflict.reason,
        canEscalate: true,
      }, { status: 403 })
    }
  }

  switch (action) {
    // ─── Posts ────────────────────────────────────────────────────────────
    case 'hide_post': {
      if (!await canModeratePost(admin, targetId)) return NextResponse.json({ error: 'خارج صلاحيتك' }, { status: 403 })
      await db.post.update({ where: { id: targetId }, data: { status: 'HIDDEN' } })
      await logAction(session.userId, admin.name, 'hide_post', 'post', targetId, reason)
      return NextResponse.json({ success: true })
    }

    case 'remove_post': {
      // Only SUPER_ADMIN can permanently delete
      if (!isSuper) return NextResponse.json({ error: 'الحذف الدائم متاح فقط للمدير العام' }, { status: 403 })
      await db.post.update({ where: { id: targetId }, data: { status: 'REMOVED' } })
      await logAction(session.userId, admin.name, 'remove_post', 'post', targetId, reason)
      try { await cleanupNotificationsFor({ postId: targetId }) } catch { /* non-fatal */ }
      return NextResponse.json({ success: true })
    }

    case 'restore_post': {
      if (!await canModeratePost(admin, targetId)) return NextResponse.json({ error: 'خارج صلاحيتك' }, { status: 403 })
      await db.post.update({ where: { id: targetId }, data: { status: 'ACTIVE' } })
      await logAction(session.userId, admin.name, 'restore_post', 'post', targetId, reason)
      return NextResponse.json({ success: true })
    }

    case 'highlight_pin': {
      if (!await canModeratePost(admin, targetId)) return NextResponse.json({ error: 'خارج صلاحيتك' }, { status: 403 })
      const { countActiveModPins, invalidateHighlights, HIGHLIGHT_CONFIG } = await import('@/lib/highlights')
      const post = await db.post.findUnique({
        where: { id: targetId },
        select: { neighborhoodId: true, status: true, highlightPinnedAt: true },
      })
      if (!post) return NextResponse.json({ error: 'not_found' }, { status: 404 })
      if (post.status !== 'ACTIVE') return NextResponse.json({ error: 'post_not_active' }, { status: 400 })
      if (!post.highlightPinnedAt) {
        const active = await countActiveModPins(post.neighborhoodId)
        if (active >= HIGHLIGHT_CONFIG.MAX_PINNED) {
          return NextResponse.json({ error: 'pin_limit', max: HIGHLIGHT_CONFIG.MAX_PINNED }, { status: 409 })
        }
      }
      await db.post.update({ where: { id: targetId }, data: { highlightPinnedAt: new Date() } })
      invalidateHighlights(post.neighborhoodId)
      await logAction(session.userId, admin.name, 'highlight_pin', 'post', targetId, reason)
      return NextResponse.json({ success: true })
    }

    case 'highlight_unpin': {
      if (!await canModeratePost(admin, targetId)) return NextResponse.json({ error: 'خارج صلاحيتك' }, { status: 403 })
      const { invalidateHighlights } = await import('@/lib/highlights')
      const post = await db.post.findUnique({
        where: { id: targetId },
        select: { neighborhoodId: true },
      })
      if (!post) return NextResponse.json({ error: 'not_found' }, { status: 404 })
      await db.post.update({ where: { id: targetId }, data: { highlightPinnedAt: null } })
      invalidateHighlights(post.neighborhoodId)
      await logAction(session.userId, admin.name, 'highlight_unpin', 'post', targetId, reason)
      return NextResponse.json({ success: true })
    }

    // ─── Users: ban/unban ────────────────────────────────────────────────
    case 'ban_user': {
      // NEIGHBORHOOD_MOD → neighborhood ban (BANNED_TEMP), SUPER_ADMIN → global (BANNED_PERM)
      if (!await canModerateUser(admin, targetId)) return NextResponse.json({ error: 'خارج صلاحيتك' }, { status: 403 })
      // Prevent banning admins unless you're SUPER_ADMIN
      const target = await db.user.findUnique({ where: { id: targetId }, select: { role: true } })
      if (target && ADMIN_ROLES.includes(target.role) && !isSuper) {
        return NextResponse.json({ error: 'لا يمكنك حظر مشرف' }, { status: 403 })
      }
      const banStatus = isSuper ? 'BANNED_PERM' : 'BANNED_TEMP'
      const banScope = isSuper ? 'global' : 'neighborhood'
      await db.user.update({ where: { id: targetId }, data: { status: banStatus } })
      await logAction(session.userId, admin.name, 'ban_user', 'user', targetId, reason, `scope=${banScope}`)
      return NextResponse.json({ success: true, banScope })
    }

    case 'temp_ban_user': {
      if (!await canModerateUser(admin, targetId)) return NextResponse.json({ error: 'خارج صلاحيتك' }, { status: 403 })
      const target2 = await db.user.findUnique({ where: { id: targetId }, select: { role: true } })
      if (target2 && ADMIN_ROLES.includes(target2.role) && !isSuper) {
        return NextResponse.json({ error: 'لا يمكنك حظر مشرف' }, { status: 403 })
      }
      await db.user.update({ where: { id: targetId }, data: { status: 'BANNED_TEMP' } })
      await logAction(session.userId, admin.name, 'temp_ban_user', 'user', targetId, reason, 'scope=neighborhood')
      return NextResponse.json({ success: true })
    }

    case 'unban_user': {
      if (!await canModerateUser(admin, targetId)) return NextResponse.json({ error: 'خارج صلاحيتك' }, { status: 403 })
      await db.user.update({ where: { id: targetId }, data: { status: 'ACTIVE' } })
      await logAction(session.userId, admin.name, 'unban_user', 'user', targetId, reason)
      return NextResponse.json({ success: true })
    }

    case 'delete_user': {
      if (!isSuper) return NextResponse.json({ error: 'حذف المستخدم متاح فقط للمدير العام' }, { status: 403 })
      if (targetId === session.userId) return NextResponse.json({ error: 'لا يمكنك حذف نفسك' }, { status: 403 })
      const target3 = await db.user.findUnique({ where: { id: targetId }, select: { role: true, name: true, lastName: true, phone: true } })
      if (target3?.role === 'SUPER_ADMIN') return NextResponse.json({ error: 'لا يمكن حذف مدير عام' }, { status: 403 })
      // Delete all user data in order
      await db.notification.deleteMany({ where: { userId: targetId } })
      await db.reaction.deleteMany({ where: { userId: targetId } })
      await db.comment.deleteMany({ where: { authorId: targetId } })
      await db.report.deleteMany({ where: { reporterId: targetId } })
      await db.message.deleteMany({ where: { senderId: targetId } })
      await db.thread.deleteMany({ where: { OR: [{ user1Id: targetId }, { user2Id: targetId }] } })
      await db.post.deleteMany({ where: { authorId: targetId } })
      await db.otpCode.deleteMany({ where: { userId: targetId } })
      await db.user.delete({ where: { id: targetId } })
      await logAction(session.userId, admin.name, 'delete_user', 'user', targetId, reason, `phone=${target3?.phone}`)
      return NextResponse.json({ success: true })
    }

    // ─── Roles: SUPER_ADMIN only ─────────────────────────────────────────
    case 'change_role': {
      if (!isSuper) return NextResponse.json({ error: 'تغيير الصلاحيات متاح فقط للمدير العام' }, { status: 403 })
      // Prevent self-promotion/demotion
      if (targetId === session.userId) return NextResponse.json({ error: 'لا يمكنك تغيير صلاحياتك بنفسك' }, { status: 403 })
      const newRole = body.newRole || reason // support both field names
      const validRoles = ['RESIDENT', 'NEIGHBORHOOD_MOD', 'PLATFORM_MOD', 'SUPER_ADMIN']
      if (!newRole || !validRoles.includes(newRole)) {
        return NextResponse.json({ error: 'صلاحية غير صالحة' }, { status: 400 })
      }
      await db.user.update({ where: { id: targetId }, data: { role: newRole } })
      await logAction(session.userId, admin.name, 'change_role', 'user', targetId, undefined, `→ ${newRole}`)
      return NextResponse.json({ success: true })
    }

    case 'change_plan': {
      if (!isSuper) return NextResponse.json({ error: 'متاح فقط للمدير العام' }, { status: 403 })
      const newPlan = body.newPlan
      if (!newPlan || !['FREE', 'PREMIUM'].includes(newPlan)) {
        return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
      }
      // Get previous plan for audit
      const targetUser = await db.user.findUnique({ where: { id: targetId }, select: { plan: true } })
      const previousPlan = targetUser?.plan || 'FREE'
      if (previousPlan === newPlan) {
        return NextResponse.json({ error: 'Already on this plan' }, { status: 400 })
      }
      await db.user.update({ where: { id: targetId }, data: { plan: newPlan } })
      // Audit log
      await db.planChangeLog.create({
        data: {
          userId: targetId,
          previousPlan,
          newPlan,
          changedBy: session.userId,
          reason: reason || null,
        },
      })
      await logAction(session.userId, admin.name, 'change_plan', 'user', targetId, reason, `${previousPlan} → ${newPlan}`)
      return NextResponse.json({ success: true })
    }

    case 'remove_provider': {
      if (!isSuper) return NextResponse.json({ error: 'متاح فقط للمدير العام' }, { status: 403 })
      await db.user.update({ where: { id: targetId }, data: { accountType: 'NORMAL', providerStatus: 'NONE', providerStatusChangedAt: new Date() } })
      await logAction(session.userId, admin.name, 'remove_provider', 'user', targetId)
      return NextResponse.json({ success: true })
    }

    case 'approve_verification': {
      // Restricted to SUPER_ADMIN + PLATFORM_MOD (audit H-3). A
      // NEIGHBORHOOD_MOD has no business issuing the platform-wide
      // VERIFIED_PROVIDER badge — that role is scoped to a single
      // hood and a compromised local mod could otherwise manufacture
      // verified providers.
      if (admin.role !== 'SUPER_ADMIN' && admin.role !== 'PLATFORM_MOD') {
        return NextResponse.json({ error: 'forbidden_role_for_verification' }, { status: 403 })
      }
      const vr = await db.verificationRequest.findUnique({ where: { id: targetId } })
      if (!vr || vr.status !== 'pending') return NextResponse.json({ error: 'Not found' }, { status: 404 })
      await db.user.update({ where: { id: vr.userId }, data: { accountType: 'VERIFIED_PROVIDER', providerStatus: 'VERIFIED', providerStatusChangedAt: new Date() } })
      await db.verificationRequest.update({ where: { id: targetId }, data: { status: 'approved', reviewedBy: session.userId, reviewedAt: new Date() } })
      await logAction(session.userId, admin.name, 'approve_verification', 'request', targetId)
      return NextResponse.json({ success: true })
    }

    case 'reject_verification': {
      // Symmetric with approve_verification — same role restriction
      // so a NEIGHBORHOOD_MOD also can't game the queue by bulk-
      // rejecting legitimate applicants.
      if (admin.role !== 'SUPER_ADMIN' && admin.role !== 'PLATFORM_MOD') {
        return NextResponse.json({ error: 'forbidden_role_for_verification' }, { status: 403 })
      }
      const vr2 = await db.verificationRequest.findUnique({ where: { id: targetId } })
      if (!vr2 || vr2.status !== 'pending') return NextResponse.json({ error: 'Not found' }, { status: 404 })
      await db.verificationRequest.update({ where: { id: targetId }, data: { status: 'rejected', reviewedBy: session.userId, reviewedAt: new Date() } })
      await logAction(session.userId, admin.name, 'reject_verification', 'request', targetId, reason)
      return NextResponse.json({ success: true })
    }

    case 'set_reputation': {
      if (!isSuper) return NextResponse.json({ error: 'تعديل النقاط متاح فقط للمدير العام' }, { status: 403 })
      const newRep = parseInt(body.newReputation)
      if (isNaN(newRep) || newRep < 0) return NextResponse.json({ error: 'قيمة غير صالحة' }, { status: 400 })
      const oldUser = await db.user.findUnique({ where: { id: targetId }, select: { reputation: true } })
      await db.user.update({ where: { id: targetId }, data: { reputation: newRep } })
      await logAction(session.userId, admin.name, 'set_reputation', 'user', targetId, undefined, `${oldUser?.reputation} → ${newRep}`)
      return NextResponse.json({ success: true })
    }

    // ─── Reports: review/ignore ──────────────────────────────────────────
    case 'review_reports': {
      if (!await canModeratePost(admin, targetId)) return NextResponse.json({ error: 'خارج صلاحيتك' }, { status: 403 })
      // Mark all reports on this post as reviewed
      await db.report.updateMany({
        where: { postId: targetId, status: 'PENDING' },
        data: { status: 'REVIEWED' },
      })
      await logAction(session.userId, admin.name, 'review_reports', 'post', targetId, reason)
      return NextResponse.json({ success: true })
    }

    case 'dismiss_reports': {
      if (!await canModeratePost(admin, targetId)) return NextResponse.json({ error: 'خارج صلاحيتك' }, { status: 403 })
      await db.report.updateMany({
        where: { postId: targetId, status: 'PENDING' },
        data: { status: 'DISMISSED' },
      })
      // Reset report count so the post doesn't keep appearing
      await db.post.update({ where: { id: targetId }, data: { reportCount: 0 } })
      await logAction(session.userId, admin.name, 'dismiss_reports', 'post', targetId, reason)
      return NextResponse.json({ success: true })
    }

    // ─── Mod role requests ────────────────────────────────────────────────
    case 'approve_mod_request': {
      if (!isSuper) return NextResponse.json({ error: 'متاح فقط للمدير العام' }, { status: 403 })
      const mr = await db.modRequest.findUnique({ where: { id: targetId } })
      if (!mr || mr.status !== 'pending') return NextResponse.json({ error: 'Not found' }, { status: 404 })
      await db.user.update({ where: { id: mr.userId }, data: { role: 'NEIGHBORHOOD_MOD', modApprovedAt: new Date() } })
      await db.modRequest.update({ where: { id: targetId }, data: { status: 'approved', reviewedBy: session.userId, reviewedAt: new Date() } })
      // Bell row for the bell dropdown
      await db.notification.create({
        data: { userId: mr.userId, type: 'SYSTEM', actorId: session.userId, title: 'تم قبول طلبك', titleEn: 'Request Approved', body: 'أصبحت مشرف حي! يمكنك الآن إدارة حيّك من لوحة التحكم', bodyEn: 'You are now a Neighborhood Mod! Manage your neighborhood from the admin panel.' },
      })
      // Realtime push to the applicant — the profile banner re-fetches
      // /api/mod-request on push receipt so the decision lands without
      // a manual refresh.
      try {
        await db.notifJob.create({
          data: {
            type: 'mod_request_resolved',
            priority: 'high',
            targetType: 'user',
            targetRef: mr.userId,
            payload: { requestId: mr.id, status: 'approved' },
          },
        })
        kickNotifCron()
      } catch (err) {
        console.error('[MOD_REQUEST] approve push enqueue failed', err)
      }
      await logAction(session.userId, admin.name, 'approve_mod_request', 'request', targetId, undefined, `user=${mr.userId}`)
      return NextResponse.json({ success: true })
    }

    case 'reject_mod_request': {
      if (!isSuper) return NextResponse.json({ error: 'متاح فقط للمدير العام' }, { status: 403 })
      const mr2 = await db.modRequest.findUnique({ where: { id: targetId } })
      if (!mr2 || mr2.status !== 'pending') return NextResponse.json({ error: 'Not found' }, { status: 404 })
      await db.modRequest.update({ where: { id: targetId }, data: { status: 'rejected', reviewedBy: session.userId, reviewedAt: new Date() } })
      await db.notification.create({
        data: { userId: mr2.userId, type: 'SYSTEM', actorId: session.userId, title: 'تم رفض طلبك', titleEn: 'Request Rejected', body: 'لم يتم قبول طلبك لتكون مشرف حي. يمكنك التقديم مرة أخرى لاحقاً', bodyEn: 'Your mod request was not accepted. You can apply again later.' },
      })
      // Realtime push to the applicant with the rejection reason so
      // they see the decision instantly on their phone.
      try {
        await db.notifJob.create({
          data: {
            type: 'mod_request_resolved',
            priority: 'high',
            targetType: 'user',
            targetRef: mr2.userId,
            payload: { requestId: mr2.id, status: 'rejected', reason: reason || null },
          },
        })
        kickNotifCron()
      } catch (err) {
        console.error('[MOD_REQUEST] reject push enqueue failed', err)
      }
      await logAction(session.userId, admin.name, 'reject_mod_request', 'request', targetId, reason, `user=${mr2.userId}`)
      return NextResponse.json({ success: true })
    }

    // ─── Neighborhood requests ───────────────────────────────────────────
    case 'approve_nbhd_request': {
      const request = await db.neighborhoodChangeRequest.findUnique({ where: { id: targetId } })
      if (!request || request.status !== 'pending') return NextResponse.json({ error: 'Not found' }, { status: 404 })
      await db.user.update({ where: { id: request.userId }, data: { neighborhoodId: request.requestedNeighborhoodId } })
      await db.neighborhoodChangeLog.create({
        data: { userId: request.userId, fromNeighborhoodId: request.currentNeighborhoodId, toNeighborhoodId: request.requestedNeighborhoodId, reason: request.reason, customReason: request.customReason, changedBy: 'admin' },
      })
      await db.neighborhoodChangeRequest.update({ where: { id: targetId }, data: { status: 'approved', reviewedBy: session.userId, reviewedAt: new Date() } })
      await logAction(session.userId, admin.name, 'approve_nbhd', 'request', targetId)
      return NextResponse.json({ success: true })
    }

    case 'reject_nbhd_request': {
      await db.neighborhoodChangeRequest.update({ where: { id: targetId }, data: { status: 'rejected', reviewedBy: session.userId, reviewedAt: new Date() } })
      await logAction(session.userId, admin.name, 'reject_nbhd', 'request', targetId, reason)
      return NextResponse.json({ success: true })
    }

    case 'reply_neighborhood_report': {
      const nr = await db.neighborhoodReport.findUnique({ where: { id: targetId } })
      if (!nr) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const reply = body.reply || reason
      if (!reply?.trim()) return NextResponse.json({ error: 'الرد مطلوب' }, { status: 400 })
      await db.neighborhoodReport.update({
        where: { id: targetId },
        data: { reply: reply.trim(), repliedBy: session.userId, repliedAt: new Date(), status: body.newStatus || 'resolved' },
      })
      await db.notification.create({
        data: {
          userId: nr.userId, type: 'SYSTEM', actorId: session.userId,
          title: 'رد مشرف الحي على بلاغك', titleEn: 'Admin replied to your report',
          body: reply.trim().slice(0, 100), bodyEn: reply.trim().slice(0, 100),
        },
      })
      // Send email if user has verified email
      const nrUser = await db.user.findUnique({ where: { id: nr.userId }, select: { email: true, emailVerified: true } })
      if (nrUser?.email && nrUser.emailVerified) {
        sendSupportReply(nrUser.email, nr.subject, reply.trim()).catch(() => {})
      }
      await logAction(session.userId, admin.name, 'reply_report', 'report', targetId)
      return NextResponse.json({ success: true })
    }

    case 'reply_ticket': {
      const ticket = await db.supportTicket.findUnique({
        where: { id: targetId },
        include: { user: { select: { email: true, emailVerified: true } } },
      })
      if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const reply = body.reply || reason
      if (!reply?.trim()) return NextResponse.json({ error: 'الرد مطلوب' }, { status: 400 })
      const newStatus = body.newStatus || 'resolved'
      await db.supportTicket.update({
        where: { id: targetId },
        data: { reply: reply.trim(), repliedBy: session.userId, repliedAt: new Date(), status: newStatus },
      })
      // Notify user in-app
      await db.notification.create({
        data: {
          userId: ticket.userId, type: 'SYSTEM', actorId: session.userId,
          title: 'رد على تذكرتك', titleEn: 'Reply to your ticket',
          body: reply.trim().slice(0, 100), bodyEn: reply.trim().slice(0, 100),
        },
      })
      // Send email if user has verified email
      if (ticket.user?.email && ticket.user.emailVerified) {
        sendSupportReply(ticket.user.email, ticket.subject, reply.trim()).catch(() => {})
      }
      await logAction(session.userId, admin.name, 'reply_ticket', 'ticket', targetId, undefined, `status=${newStatus}`)
      return NextResponse.json({ success: true })
    }

    case 'close_ticket': {
      await db.supportTicket.update({ where: { id: targetId }, data: { status: 'closed' } })
      await logAction(session.userId, admin.name, 'close_ticket', 'ticket', targetId)
      return NextResponse.json({ success: true })
    }

    // ─── Direct email to user (SUPER_ADMIN only) ──────────────────────
    case 'send_email': {
      if (!isSuper) return NextResponse.json({ error: 'متاح فقط للمدير العام' }, { status: 403 })
      const targetUser = await db.user.findUnique({
        where: { id: targetId },
        select: { email: true, emailVerified: true, name: true, lastName: true },
      })
      if (!targetUser?.email) return NextResponse.json({ error: 'المستخدم ليس لديه بريد إلكتروني' }, { status: 400 })
      const emailSubject = body.emailSubject
      const emailBody = body.emailBody
      if (!emailSubject?.trim() || !emailBody?.trim()) {
        return NextResponse.json({ error: 'العنوان والمحتوى مطلوبان' }, { status: 400 })
      }
      const sent = await sendAdminEmail(targetUser.email, emailSubject.trim(), emailBody.trim())
      if (!sent) return NextResponse.json({ error: 'فشل إرسال البريد — تحقق من إعدادات SMTP' }, { status: 500 })
      await logAction(session.userId, admin.name, 'send_email', 'user', targetId, undefined, `to=${targetUser.email}, subject=${emailSubject.trim()}`)
      return NextResponse.json({ success: true, sentTo: targetUser.email })
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}

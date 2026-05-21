import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { ReportReason } from '@prisma/client'
import { apiError } from '@/lib/validation'
import {
  addReputation,
  REP_POINTS,
  getReportWeight,
  getAuthorHideThreshold,
  getAuthorRemoveThreshold,
} from '@/lib/reputation'
import { requireUserReady } from '@/lib/requireUserReady'
import { cleanupNotificationsFor } from '@/lib/notifications'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'

const MAX_REPORTS_PER_HOUR = 5
const VALID_REASONS = Object.values(ReportReason)

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json(apiError('يجب تسجيل الدخول', 401), { status: 401 })
    }

    const ready = await requireUserReady(session.userId)
    if (!ready.ok) return ready.response

    const { postId, reason } = await req.json()

    if (!postId || !reason) {
      return NextResponse.json(apiError('بيانات ناقصة', 400), { status: 400 })
    }

    // Validate reason
    if (!VALID_REASONS.includes(reason)) {
      return NextResponse.json(apiError('سبب غير صالح', 400), { status: 400 })
    }

    // Rate limit: max 5 reports per hour (bypassed for SUPER_ADMIN)
    const reporter = await db.user.findUnique({
      where: { id: session.userId },
      select: { role: true },
    })
    const bypass = isSuperAdminRole(reporter?.role)
    if (!bypass) {
      const oneHourAgo = new Date(Date.now() - 3600_000)
      const recentReports = await db.report.count({
        where: { reporterId: session.userId, createdAt: { gte: oneHourAgo } },
      })
      if (recentReports >= MAX_REPORTS_PER_HOUR) {
        console.log(`[RATE_LIMIT] reports: user=${session.userId}, count=${recentReports}`)
        return NextResponse.json(apiError('حاول لاحقاً', 429), { status: 429 })
      }
    }

    const post = await db.post.findUnique({ where: { id: postId } })
    if (!post) {
      return NextResponse.json(apiError('المنشور غير موجود', 404), { status: 404 })
    }

    if (post.authorId === session.userId) {
      return NextResponse.json(apiError('لا يمكن الإبلاغ عن منشورك', 400), { status: 400 })
    }

    const existing = await db.report.findUnique({
      where: { reporterId_postId: { reporterId: session.userId, postId } },
    })
    if (existing) {
      return NextResponse.json(apiError('أبلغت عن هذا المنشور مسبقاً', 400), { status: 400 })
    }

    await db.report.create({
      data: {
        postId,
        reporterId: session.userId,
        reportedUserId: post.authorId,
        reason,
      },
    })

    const newCount = post.reportCount + 1
    let newStatus = post.status

    // Log suspicious burst: 3+ reports on same post within 1 hour
    if (newCount >= 3) {
      const recentOnPost = await db.report.count({
        where: { postId, createdAt: { gte: new Date(Date.now() - 3600_000) } },
      })
      if (recentOnPost >= 3) {
        console.log(`[MONITOR] report burst: postId=${postId}, reports_1h=${recentOnPost}, total=${newCount}`)
      }
    }

    // Weighted-report system: each reporter's contribution scales
    // with their reputation tier, and the threshold to hide / remove
    // scales with the AUTHOR's tier. Lower-rep authors are still
    // easier to hide (so spam from a fresh account flips out fast);
    // top-rep authors still need substantial signal — but a trusted
    // reporter now counts as 1.2 instead of 1.0, so coordinated
    // signal from real users surfaces sooner. See
    // src/lib/reputation-levels.ts for the calibration & invariants.
    const [author, allReports] = await Promise.all([
      db.user.findUnique({ where: { id: post.authorId }, select: { reputation: true } }),
      db.report.findMany({
        where: { postId },
        select: { reporter: { select: { reputation: true } } },
      }),
    ])
    const weightedScore = allReports.reduce(
      (acc, r) => acc + getReportWeight(r.reporter?.reputation ?? 0),
      0,
    )
    let hideThreshold = getAuthorHideThreshold(author?.reputation ?? 0)
    let removeThreshold = getAuthorRemoveThreshold(author?.reputation ?? 0)
    // Outside requests carry less trust (the author isn't a resident of
    // this neighborhood), so they auto-hide / auto-remove on a LOWER
    // threshold than resident posts — abuse from outsiders flips out
    // faster. 0.6× of the author-tier threshold, with sane floors.
    if (post.originScope === 'OUTSIDE_REQUEST') {
      hideThreshold = Math.max(1, Math.round(hideThreshold * 0.6))
      removeThreshold = Math.max(2, Math.round(removeThreshold * 0.6))
    }

    if (weightedScore >= removeThreshold) {
      newStatus = 'REMOVED'
      // Rep penalty for confirmed removal
      await addReputation({ userId: post.authorId, action: 'report_confirmed', points: REP_POINTS.report_confirmed, postId })
      console.log(`[MODERATION] post auto-removed: postId=${postId}, reports=${newCount}, score=${weightedScore.toFixed(2)}, threshold=${removeThreshold}`)
    } else if (weightedScore >= hideThreshold) {
      newStatus = 'HIDDEN'
      console.log(`[MODERATION] post auto-hidden: postId=${postId}, reports=${newCount}, score=${weightedScore.toFixed(2)}, threshold=${hideThreshold}`)
    }

    await db.post.update({
      where: { id: postId },
      data: { reportCount: newCount, status: newStatus },
    })

    // Post crossed into REMOVED via the report threshold — clear bell
    // notifications referencing it so they don't tap-jump to a 404.
    // HIDDEN posts stay reachable to mods only; we leave their bell
    // entries alone so a mod can still trace back to the post via
    // the notification.
    if (newStatus === 'REMOVED') {
      try { await cleanupNotificationsFor({ postId }) } catch { /* non-fatal */ }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[ERROR] report:', error)
    return NextResponse.json(apiError('خطأ في الخادم', 500), { status: 500 })
  }
}

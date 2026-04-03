import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { ReportReason } from '@prisma/client'
import { apiError } from '@/lib/validation'
import { addReputation, REP_POINTS, getReportThreshold } from '@/lib/reputation'

const HIDE_THRESHOLD = 3
const REMOVE_THRESHOLD = 5
const MAX_REPORTS_PER_HOUR = 5
const VALID_REASONS = Object.values(ReportReason)

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json(apiError('يجب تسجيل الدخول', 401), { status: 401 })
    }

    const { postId, reason } = await req.json()

    if (!postId || !reason) {
      return NextResponse.json(apiError('بيانات ناقصة', 400), { status: 400 })
    }

    // Validate reason
    if (!VALID_REASONS.includes(reason)) {
      return NextResponse.json(apiError('سبب غير صالح', 400), { status: 400 })
    }

    // Rate limit: max 5 reports per hour
    const oneHourAgo = new Date(Date.now() - 3600_000)
    const recentReports = await db.report.count({
      where: { reporterId: session.userId, createdAt: { gte: oneHourAgo } },
    })
    if (recentReports >= MAX_REPORTS_PER_HOUR) {
      console.log(`[RATE_LIMIT] reports: user=${session.userId}, count=${recentReports}`)
      return NextResponse.json(apiError('حاول لاحقاً', 429), { status: 429 })
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

    // Use rep-based thresholds: trusted users need more reports to be hidden
    const author = await db.user.findUnique({ where: { id: post.authorId }, select: { reputation: true } })
    const hideThreshold = getReportThreshold(author?.reputation ?? 0)
    const removeThreshold = hideThreshold + 2

    if (newCount >= removeThreshold) {
      newStatus = 'REMOVED'
      // Rep penalty for confirmed removal
      await addReputation({ userId: post.authorId, action: 'report_confirmed', points: REP_POINTS.report_confirmed, postId })
      console.log(`[MODERATION] post auto-removed: postId=${postId}, reports=${newCount}, threshold=${removeThreshold}`)
    } else if (newCount >= hideThreshold) {
      newStatus = 'HIDDEN'
      console.log(`[MODERATION] post auto-hidden: postId=${postId}, reports=${newCount}, threshold=${hideThreshold}`)
    }

    await db.post.update({
      where: { id: postId },
      data: { reportCount: newCount, status: newStatus },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[ERROR] report:', error)
    return NextResponse.json(apiError('خطأ في الخادم', 500), { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { UserReportReason, UserReportSource } from '@prisma/client'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { kickNotifCron } from '@/lib/kickNotifCron'
import {
  hashReporterIp,
  classifyIncomingReport,
  flagsToString,
  scoreModReports,
  applyModReportDecision,
} from '@/lib/modReportWeighting'

export const dynamic = 'force-dynamic'

const VALID_REASONS = Object.values(UserReportReason) as string[]
const VALID_SOURCES = Object.values(UserReportSource) as string[]
const DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000 // 6h: same reporter+target+reason is a dup (non-mod targets)
const MOD_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000 // 24h: reports against a mod are stricter
const RATE_WINDOW_MS = 60 * 60 * 1000       // 1h burst cap
const MAX_REPORTS_PER_HOUR = 10              // across all targets

// Only these reasons are valid when the target is a moderator being
// reported in their capacity as a moderator. A regular reason (SPAM,
// IMPERSONATION, etc.) can still be used against a mod — it just
// won't flip isModeratorTarget.
const MOD_REASONS = new Set<string>([
  'MOD_ABUSE_OF_POWER',
  'MOD_UNFAIR_MODERATION',
  'MOD_HARASSMENT',
  'MOD_INACTIVE',
])

/**
 * POST /api/users/[id]/report
 *
 * Account-level report against another user. Distinct from post
 * reporting (/api/posts/report) and from blocking (/api/users/block) —
 * this creates a UserReport row for moderators to review, without
 * altering either of the other two flows.
 *
 * Body:
 *   reason         required, UserReportReason enum
 *   details        optional, trimmed, max 1000 chars
 *   source         optional, UserReportSource enum (defaults to PROFILE)
 *   postId         optional context
 *   conversationId optional context
 *   listingId      optional context
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const targetUserId = params.id
  if (!targetUserId || typeof targetUserId !== 'string') {
    return NextResponse.json({ error: 'invalid_target' }, { status: 400 })
  }
  if (targetUserId === session.userId) {
    return NextResponse.json({ error: 'cannot_report_self' }, { status: 400 })
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const reason = String(body.reason ?? '').trim()
  if (!VALID_REASONS.includes(reason)) {
    return NextResponse.json({ error: 'invalid_reason' }, { status: 400 })
  }

  const rawSource = String(body.source ?? 'PROFILE').trim()
  const source = (VALID_SOURCES.includes(rawSource) ? rawSource : 'PROFILE') as UserReportSource
  const details = typeof body.details === 'string' ? body.details.trim().slice(0, 1000) : null
  const postId = typeof body.postId === 'string' && body.postId ? body.postId : null
  const conversationId = typeof body.conversationId === 'string' && body.conversationId ? body.conversationId : null
  const listingId = typeof body.listingId === 'string' && body.listingId ? body.listingId : null

  // Confirm the target exists so mods don't inherit ghost rows.
  // Select neighborhoodId + name + role so we can (a) route the
  // mod-fanout below and (b) decide whether this report should be
  // flagged as a moderator-target report.
  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, neighborhoodId: true, role: true, modStatus: true },
  })
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Mod-specific reasons are only meaningful when the target actually
  // IS a NEIGHBORHOOD_MOD. Reject the mismatch explicitly so abusers
  // can't pollute the mod-report aggregation with false positives
  // against regular residents.
  const isModReason = MOD_REASONS.has(reason)
  if (isModReason && target.role !== 'NEIGHBORHOOD_MOD') {
    return NextResponse.json({ error: 'invalid_reason_for_target' }, { status: 400 })
  }
  const isModeratorTarget = isModReason && target.role === 'NEIGHBORHOOD_MOD'

  // Reporter state — used for bypass + rate limiting + admin routing
  // + credibility weighting. The reporter's own neighborhoodId drives
  // the mod fan-out so that a resident's reports land with their
  // local mod team, not with mods of whichever neighborhood the target
  // happens to live in. `reputation` is consumed by the weighted
  // evaluator — low-rep / negative-rep reporters don't get to solo-
  // flip a moderator into review.
  const reporter = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, status: true, name: true, neighborhoodId: true, reputation: true },
  })
  const bypass = isSuperAdminRole(reporter?.role)

  // Request-origin IP for cluster detection — hashed before persist,
  // raw IP never touches the DB. Best-effort: Vercel supplies
  // x-forwarded-for; local dev / tests fall through as null.
  const reporterIpHash = hashReporterIp(
    req.headers.get('x-forwarded-for') ||
    req.headers.get('x-real-ip') ||
    null,
  )
  if (!bypass && (reporter?.status === 'BANNED_TEMP' || reporter?.status === 'BANNED_PERM')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  if (!bypass) {
    // Duplicate guard: same reporter+target+reason inside DEDUP_WINDOW_MS.
    // Silently treat as success so the UI doesn't expose the dedup rule.
    // Mod-target reports get a stricter 24h window to limit coordinated
    // pile-ons against a single moderator.
    const windowMs = isModeratorTarget ? MOD_DEDUP_WINDOW_MS : DEDUP_WINDOW_MS
    const dupWindow = new Date(Date.now() - windowMs)
    const duplicate = await db.userReport.findFirst({
      where: {
        reporterId: session.userId,
        reportedUserId: targetUserId,
        reason: reason as UserReportReason,
        createdAt: { gte: dupWindow },
      },
      select: { id: true },
    })
    if (duplicate) {
      return NextResponse.json({ ok: true, deduped: true, id: duplicate.id })
    }

    // Burst cap — no reporter should file >10 account reports per hour.
    const rateWindow = new Date(Date.now() - RATE_WINDOW_MS)
    const recent = await db.userReport.count({
      where: { reporterId: session.userId, createdAt: { gte: rateWindow } },
    })
    if (recent >= MAX_REPORTS_PER_HOUR) {
      return NextResponse.json(
        { error: 'rate_limited', reason: 'too_many_reports' },
        { status: 429 },
      )
    }
  }

  // Abuse-signal tagging at create time. Re-evaluated at score time,
  // but pre-tagging is cheap and gives the admin dashboard something
  // to explain why a report was discounted.
  const abuseFlags = isModeratorTarget
    ? await classifyIncomingReport({
        reporterReputation: reporter?.reputation ?? 0,
        reportedUserId: targetUserId,
        reporterIpHash,
      })
    : []

  try {
    const created = await db.userReport.create({
      data: {
        reporterId: session.userId,
        reportedUserId: targetUserId,
        reason: reason as UserReportReason,
        details,
        source,
        postId,
        conversationId,
        listingId,
        isModeratorTarget,
        // Snapshot the reporter's neighborhood so the aggregation
        // query for mod-report-health is O(1) and stays correct even
        // if the mod is later moved or demoted.
        neighborhoodId: reporter?.neighborhoodId || null,
        reporterIpHash,
        abuseFlags: flagsToString(abuseFlags),
      },
      select: { id: true, createdAt: true, status: true },
    })

    // Moderator accountability — weighted evaluator decides whether
    // to flip modStatus to UNDER_REVIEW based on unique reporters,
    // rolling window, credibility, and cluster detection. Replaces
    // the earlier fixed 5-report threshold, which was trivially
    // gameable by a coordinated group or a throwaway-account spree.
    // Role stays NEIGHBORHOOD_MOD; only an admin action demotes.
    if (isModeratorTarget) {
      try {
        const score = await scoreModReports(targetUserId)
        await applyModReportDecision(targetUserId, score)
      } catch (err) {
        console.error('[MOD_LIFECYCLE] score/apply failed', err)
      }
    }
    console.log('[USER_REPORT] created', {
      id: created.id,
      reporter: session.userId,
      target: targetUserId,
      reason,
      source,
    })

    // ── Notify the mod team ─────────────────────────────────────────
    // Scope: the REPORTER's own neighborhood mods plus every
    // SUPER_ADMIN. The reporter is the resident the mod team serves,
    // so their local mods see the report even when the reported user
    // belongs to a different neighborhood. SUPER_ADMIN is always
    // included as platform-wide backstop. PLATFORM_MOD does not
    // receive per-report pushes; they can still view everything via
    // the mod dashboard. Mods for any other neighborhood never get
    // pinged.
    const reporterName = reporter?.name || null
    const reporterNeighborhoodId = reporter?.neighborhoodId || null
    const targetName = target.name || null
    const reasonLabel = REASON_LABELS[reason as UserReportReason] || reason

    const [superAdmins, nbhdMods] = await Promise.all([
      db.user.findMany({
        where: { status: 'ACTIVE', role: 'SUPER_ADMIN' },
        select: { id: true, role: true, neighborhoodId: true },
      }),
      reporterNeighborhoodId
        ? db.user.findMany({
            where: {
              status: 'ACTIVE',
              role: 'NEIGHBORHOOD_MOD',
              neighborhoodId: reporterNeighborhoodId,
            },
            select: { id: true, role: true, neighborhoodId: true },
          })
        : Promise.resolve([] as { id: string; role: string; neighborhoodId: string | null }[]),
    ])
    const adminDetails = [...superAdmins, ...nbhdMods]
    // Defensive de-dup in case the same user shows up in both lists
    // somehow (e.g. a SUPER_ADMIN who also has neighborhoodId set).
    const seen = new Set<string>()
    const admins = adminDetails.filter((a) => {
      if (seen.has(a.id)) return false
      seen.add(a.id)
      return true
    })

    console.log('[USER_REPORT] fan-out computed', {
      reportId: created.id,
      reporterId: session.userId,
      reporterNeighborhoodId,
      reportedUserId: targetUserId,
      reportedNeighborhoodId: target.neighborhoodId,
      superAdminCount: superAdmins.length,
      nbhdModCount: nbhdMods.length,
      totalRecipients: admins.length,
      recipients: admins.map((a) => ({
        id: a.id,
        role: a.role,
        neighborhoodId: a.neighborhoodId,
      })),
    })

    if (admins.length > 0) {
      const bellTitle = `🚩 بلاغ جديد عن ${targetName || 'مستخدم'}`
      const bellTitleEn = `🚩 New user report: ${targetName || 'a user'}`
      const bellBody = `${reasonLabel.ar}${reporterName ? ` — من ${reporterName}` : ''}`
      const bellBodyEn = `${reasonLabel.en}${reporterName ? ` — by ${reporterName}` : ''}`

      ;(async () => {
        try {
          // In-app notifications for the bell dropdown / notifications page
          await db.notification.createMany({
            data: admins.map((a) => ({
              type: 'SYSTEM' as const,
              userId: a.id,
              actorId: session.userId,
              actorName: reporterName || 'النظام',
              title: bellTitle,
              titleEn: bellTitleEn,
              body: bellBody,
              bodyEn: bellBodyEn,
            })),
          })
          // Push jobs — one per admin so the cron processor can target
          // each device token individually. type='user_report' is handled
          // in /api/cron/process-notifs.
          await db.notifJob.createMany({
            data: admins.map((a) => ({
              type: 'user_report',
              priority: 'normal',
              targetType: 'user',
              targetRef: a.id,
              payload: {
                reportId: created.id,
                reportedUserId: targetUserId,
                reportedUserName: targetName,
                reporterId: session.userId,
                reporterName,
                reason,
                source,
              },
            })),
          })
          kickNotifCron()
        } catch (err) {
          console.error('[USER_REPORT] admin notify failed', err)
        }
      })()
    }

    return NextResponse.json({ ok: true, id: created.id, status: created.status })
  } catch (err) {
    console.error('[USER_REPORT] create failed', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

/** Human-readable reason labels used in the admin-facing notification
 *  copy. Full AR/EN trilingual pair; UR falls back to AR for the push
 *  title since the reporter's language isn't available here. */
const REASON_LABELS: Record<UserReportReason, { ar: string; en: string }> = {
  IMPERSONATION:         { ar: 'حساب مزيف',             en: 'Fake account / impersonation' },
  SCAM_FRAUD:            { ar: 'احتيال أو نصب',          en: 'Scam or fraud' },
  HARASSMENT:            { ar: 'تحرش',                   en: 'Harassment' },
  ABUSIVE_LANGUAGE:      { ar: 'إساءة أو تهديد',         en: 'Abusive language / threats' },
  SPAM:                  { ar: 'سبام',                    en: 'Spam' },
  INAPPROPRIATE_PROFILE: { ar: 'محتوى ملف غير لائق',      en: 'Inappropriate profile' },
  MOD_ABUSE_OF_POWER:    { ar: 'إساءة استخدام صلاحيات',   en: 'Abuse of moderator power' },
  MOD_UNFAIR_MODERATION: { ar: 'قرار إشراف غير عادل',     en: 'Unfair moderation' },
  MOD_HARASSMENT:        { ar: 'تحرش من مشرف',            en: 'Harassment by a moderator' },
  MOD_INACTIVE:          { ar: 'مشرف غير نشط',            en: 'Inactive moderator' },
  OTHER:                 { ar: 'سبب آخر',                 en: 'Other' },
}

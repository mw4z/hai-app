import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { UserReportReason, UserReportSource } from '@prisma/client'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'

export const dynamic = 'force-dynamic'

const VALID_REASONS = Object.values(UserReportReason) as string[]
const VALID_SOURCES = Object.values(UserReportSource) as string[]
const DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000 // 6h: same reporter+target+reason is a dup
const RATE_WINDOW_MS = 60 * 60 * 1000       // 1h burst cap
const MAX_REPORTS_PER_HOUR = 10              // across all targets

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

  // Confirm the target exists so mods don't inherit ghost rows
  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  })
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Reporter state — used for bypass + rate limiting
  const reporter = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true, status: true },
  })
  const bypass = isSuperAdminRole(reporter?.role)
  if (!bypass && (reporter?.status === 'BANNED_TEMP' || reporter?.status === 'BANNED_PERM')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  if (!bypass) {
    // Duplicate guard: same reporter+target+reason inside DEDUP_WINDOW_MS.
    // Silently treat as success so the UI doesn't expose the dedup rule.
    const dupWindow = new Date(Date.now() - DEDUP_WINDOW_MS)
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
      },
      select: { id: true, createdAt: true, status: true },
    })
    console.log('[USER_REPORT] created', {
      id: created.id,
      reporter: session.userId,
      target: targetUserId,
      reason,
      source,
    })
    return NextResponse.json({ ok: true, id: created.id, status: created.status })
  } catch (err) {
    console.error('[USER_REPORT] create failed', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

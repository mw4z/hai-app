import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { gateModRoute } from '@/lib/places/routeGate'
import { logModAction } from '@/lib/modAudit'
import { awardDirectoryReputation } from '@/lib/reputation/awardDirectoryReputation'
import { reportTypeToContributionType } from '@/lib/reputation/directoryRewards'

export const dynamic = 'force-dynamic'

/**
 * POST /api/mod/directory/reports/[id]/action
 * Body: { action: 'accept' | 'dismiss' | 'actioned', note?, actionType? }
 *
 *   accept   → status ACCEPTED — report confirmed valid.
 *   actioned → status ACTIONED — a real correction was applied (removal /
 *              merge / marked-closed / corrected); `actionType` records it.
 *   dismiss  → status DISMISSED — invalid / no action (note required).
 *
 * Reputation (+3) is awarded to the reporter ONLY on accept/actioned and
 * ONLY for DUPLICATE / CLOSED report types — generic / WRONG_* / SPAM /
 * OTHER never award here (no correction flow yet). Idempotent + anti-farm
 * via the existing ReputationEvent path. NEIGHBORHOOD_MOD is scoped to
 * reports on places in their own neighborhood. Existing report data is
 * preserved (status fields are additive).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, neighborhoodId: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const gate = gateModRoute(user.role)
  if (gate) return gate

  const body = await req.json().catch(() => ({}))
  const action = body?.action
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : ''
  const actionType = typeof body?.actionType === 'string' ? body.actionType.trim().slice(0, 60) : null
  if (!['accept', 'dismiss', 'actioned'].includes(action)) {
    return NextResponse.json({ error: 'إجراء غير صالح' }, { status: 400 })
  }
  // Note required for the dismiss + destructive (actioned) cases.
  if ((action === 'dismiss' || action === 'actioned') && note.length < 3) {
    return NextResponse.json({ error: 'يرجى ذكر السبب' }, { status: 400 })
  }

  const report = await db.placeReport.findUnique({
    where: { id: params.id },
    select: { id: true, type: true, userId: true, status: true, placeId: true, place: { select: { neighborhoodId: true } } },
  })
  if (!report) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (user.role === 'NEIGHBORHOOD_MOD' && report.place?.neighborhoodId !== user.neighborhoodId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const newStatus = action === 'accept' ? 'ACCEPTED' : action === 'actioned' ? 'ACTIONED' : 'DISMISSED'
  await db.placeReport.update({
    where: { id: report.id },
    data: {
      status: newStatus,
      reviewedById: user.id,
      reviewedAt: new Date(),
      reviewNote: note || null,
      actionType: action === 'actioned' ? (actionType || 'corrected') : null,
    },
  })

  await logModAction({
    moderatorId: user.id,
    actionType: `place_report_${action}`,
    targetType: 'place_report',
    targetId: report.id,
    neighborhoodId: report.place?.neighborhoodId ?? null,
    details: JSON.stringify({ reportType: report.type, note: note || null, actionType: action === 'actioned' ? actionType : null }),
  })

  // Award the reporter for a confirmed DUPLICATE/CLOSED report. No
  // self-reward; idempotent + one per (user, place, type) + 15/day cap.
  let awarded = 0
  if ((action === 'accept' || action === 'actioned') && report.userId !== user.id) {
    const ctype = reportTypeToContributionType(report.type)
    if (ctype) {
      const existing = await db.directoryContribution.findFirst({
        where: { contributorId: report.userId, type: ctype, placeId: report.placeId, status: 'APPROVED' },
        select: { id: true },
      })
      if (!existing) {
        const contribution = await db.directoryContribution.create({
          data: {
            type: ctype,
            status: 'APPROVED',
            contributorId: report.userId,
            placeId: report.placeId,
            neighborhoodId: report.place?.neighborhoodId ?? '',
            reviewedById: user.id,
            reviewedAt: new Date(),
            reviewNote: note || null,
          },
          select: { id: true },
        })
        const res = await awardDirectoryReputation({
          contributionId: contribution.id,
          userId: report.userId,
          type: ctype,
          placeId: report.placeId,
        })
        awarded = res.awarded
      }
    }
  }

  return NextResponse.json({ ok: true, status: newStatus, awarded })
}

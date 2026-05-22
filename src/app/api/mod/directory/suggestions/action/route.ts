import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { gateModRoute } from '@/lib/places/routeGate'
import { logModAction } from '@/lib/modAudit'
import { contributionTypeForField } from '@/lib/places/suggestions'
import { isValidServiceCategory } from '@/lib/services/serviceCategories'
import { PLACE_CATEGORIES } from '@/lib/places/categories'
import { awardDirectoryReputation } from '@/lib/reputation/awardDirectoryReputation'
import type { ContributionType } from '@/lib/reputation/directoryRewards'

export const dynamic = 'force-dynamic'

const PLACE_CATEGORY_KEYS = new Set(PLACE_CATEGORIES.map((c) => c.key))
void isValidServiceCategory // (service categories are separate — not used here)

/**
 * POST /api/mod/directory/suggestions/action
 * Body: { ids: string[], action: 'approve' | 'reject', note? }
 *
 * approve → apply each contribution's CHANGED fields to the place, mark
 *           APPROVED, award the contributor per contribution type
 *           (idempotent, one per user+place+type, 15/day cap). A field
 *           that no longer changes anything still applies harmlessly; the
 *           reward path is idempotent regardless.
 * reject  → mark REJECTED, apply nothing (note required).
 * NEIGHBORHOOD_MOD is scoped to suggestions in their own neighborhood.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true, neighborhoodId: true } })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const gate = gateModRoute(user.role)
  if (gate) return gate

  const body = await req.json().catch(() => ({}))
  const action = body?.action
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 20) : []
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : ''
  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'إجراء غير صالح' }, { status: 400 })
  if (action === 'reject' && note.length < 3) return NextResponse.json({ error: 'يرجى ذكر سبب الرفض' }, { status: 400 })
  if (ids.length === 0) return NextResponse.json({ error: 'لا توجد عناصر' }, { status: 400 })

  const rows = await db.directoryContribution.findMany({
    where: { id: { in: ids }, status: 'PENDING_REVIEW', type: { in: ['EDIT_PLACE', 'ADD_CONTACT', 'FIX_LOCATION'] } },
    select: { id: true, type: true, placeId: true, neighborhoodId: true, contributorId: true, payloadJson: true },
  })
  if (rows.length === 0) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  // Neighborhood scope: a NEIGHBORHOOD_MOD may only act in their own hood.
  if (user.role === 'NEIGHBORHOOD_MOD' && rows.some((r) => r.neighborhoodId !== user.neighborhoodId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  if (action === 'reject') {
    await db.directoryContribution.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { status: 'REJECTED', reviewNote: note, reviewedById: user.id, reviewedAt: new Date() },
    })
    await logModAction({
      moderatorId: user.id, actionType: 'suggestion_reject', targetType: 'directory_contribution',
      targetId: rows[0].id, neighborhoodId: rows[0].neighborhoodId, details: JSON.stringify({ ids: rows.map((r) => r.id), note }),
    })
    return NextResponse.json({ ok: true, action: 'rejected', count: rows.length })
  }

  // approve — apply each row's fields to its place, then award.
  let awarded = 0
  for (const r of rows) {
    if (!r.placeId) continue
    const payload = (r.payloadJson ?? {}) as { fields?: { key: string; suggestedValue: unknown }[] }
    const data: Record<string, unknown> = {}
    for (const f of payload.fields ?? []) {
      // Re-validate against the allowlist server-side (never trust payload).
      if (!contributionTypeForField(f.key)) continue
      if (f.key === 'category') {
        if (typeof f.suggestedValue === 'string' && PLACE_CATEGORY_KEYS.has(f.suggestedValue as any)) data.category = f.suggestedValue
        continue
      }
      if (f.key === 'latitude' || f.key === 'longitude') {
        const n = Number(f.suggestedValue)
        if (Number.isFinite(n)) data[f.key] = n
        continue
      }
      if (typeof f.suggestedValue === 'string') data[f.key] = f.suggestedValue.slice(0, f.key === 'description' ? 1000 : 300)
    }

    await db.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.placeListing.update({ where: { id: r.placeId! }, data })
      }
      await tx.directoryContribution.update({
        where: { id: r.id },
        data: { status: 'APPROVED', reviewNote: note || null, reviewedById: user.id, reviewedAt: new Date() },
      })
    })

    const res = await awardDirectoryReputation({
      contributionId: r.id,
      userId: r.contributorId,
      type: r.type as ContributionType,
      placeId: r.placeId,
    })
    awarded += res.awarded

    await logModAction({
      moderatorId: user.id, actionType: 'suggestion_approve', targetType: 'directory_contribution',
      targetId: r.id, neighborhoodId: r.neighborhoodId, details: JSON.stringify({ type: r.type, applied: Object.keys(data) }),
    })
  }

  return NextResponse.json({ ok: true, action: 'approved', count: rows.length, awarded })
}

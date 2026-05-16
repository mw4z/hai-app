import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { gatePublicRoute } from '@/lib/places/routeGate'
import { recalcPlaceRating } from '@/lib/places/recalcRating'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/directory/[id]/reviews/mine
 *
 * Soft-delete the caller's own review: status flips to
 * DELETED_BY_USER. The row stays in the table so a future
 * mod-hidden review can't be dodged by delete + re-create
 * (the POST upsert path checks status === HIDDEN_BY_MOD and
 * rejects). Rating summary is recomputed in the same
 * transaction so the average + count drop the deleted row.
 *
 * No-op (returns 200 with already=true) when there's no
 * existing review — keeps the client's "Delete" button
 * idempotent.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true },
  })
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const gate = gatePublicRoute(user.role)
  if (gate) return gate

  const existing = await db.placeReview.findUnique({
    where: { placeId_userId: { placeId: params.id, userId: user.id } },
    select: { id: true, status: true },
  })
  if (!existing) return NextResponse.json({ ok: true, already: true })
  if (existing.status === 'DELETED_BY_USER') {
    return NextResponse.json({ ok: true, already: true })
  }

  await db.$transaction(async (tx) => {
    await tx.placeReview.update({
      where: { id: existing.id },
      data: { status: 'DELETED_BY_USER' },
    })
    await recalcPlaceRating(params.id, tx)
  })

  return NextResponse.json({ ok: true })
}

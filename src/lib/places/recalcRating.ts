import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient | typeof db

/**
 * Recompute PlaceListing.ratingAvg + ratingCount from the
 * place's VISIBLE reviews. Call this AFTER every review
 * mutation (create / update / soft-delete / mod-hide) inside
 * the same db.$transaction so the denormalized counters can't
 * drift from the source of truth.
 *
 * Avg is rounded to one decimal (e.g. 4.3) so the stored
 * number is what the UI renders — no client-side rounding
 * mismatch between cards / detail page / preview card.
 *
 * Status != VISIBLE rows (HIDDEN_BY_MOD, DELETED_BY_USER) are
 * excluded by design — hidden / deleted reviews must not
 * influence the average.
 */
export async function recalcPlaceRating(placeId: string, tx: Tx = db) {
  const agg = await tx.placeReview.aggregate({
    where: { placeId, status: 'VISIBLE' },
    _avg: { rating: true },
    _count: { _all: true },
  })
  const count = agg._count._all
  const avg = count > 0 ? agg._avg.rating ?? 0 : 0
  await tx.placeListing.update({
    where: { id: placeId },
    data: {
      ratingAvg: Math.round(avg * 10) / 10,
      ratingCount: count,
    },
  })
}

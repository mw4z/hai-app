import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/broadcast/[id]/click — record that the current user opened a
 * broadcast (tapped its push). Deduped per user via the unique index, so
 * the count reflects distinct opens. Fire-and-forget from the push tap.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })

  try {
    await db.broadcastClick.upsert({
      where: { broadcastId_userId: { broadcastId: params.id, userId: session.userId } },
      create: { broadcastId: params.id, userId: session.userId },
      update: {},
    })
  } catch {
    // Broadcast may have been deleted, or a race — non-fatal.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
  return NextResponse.json({ ok: true })
}

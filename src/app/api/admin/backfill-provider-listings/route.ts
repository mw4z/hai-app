import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { ensureProviderListing } from '@/lib/services/ensureProviderListing'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/admin/backfill-provider-listings — SUPER_ADMIN only.
 *
 * One-time backfill: ensure every existing ACTIVE/VERIFIED provider has a
 * self-owned directory listing (category guessed from their bio). Idempotent
 * — re-running only creates the still-missing ones (ensureProviderListing
 * skips anyone who already has a listing, incl. mod-removed). New providers
 * are handled automatically by the activation hooks; this catches the ones
 * who became providers before that existed.
 */
export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const me = await db.user.findUnique({ where: { id: session.userId }, select: { role: true } })
  if (!me || !isSuperAdminRole(me.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const providers = await db.user.findMany({
    where: {
      providerStatus: { in: ['ACTIVE', 'VERIFIED'] },
      neighborhoodId: { not: null },
    },
    select: { id: true },
  })

  let created = 0
  let skipped = 0
  for (const p of providers) {
    const r = await ensureProviderListing(p.id)
    if (r === 'created') created++
    else skipped++
  }

  console.log('[BACKFILL] provider listings', { providers: providers.length, created, skipped, by: session.userId })
  return NextResponse.json({ ok: true, providers: providers.length, created, skipped })
}

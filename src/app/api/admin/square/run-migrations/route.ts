import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/square/run-migrations
 *
 * SUPER_ADMIN-only. Applies the two pending Square migrations
 * directly via $executeRawUnsafe — Vercel has the live DB
 * credentials, my local machine has stale ones from the May 25
 * rotation, so this is the only path to apply schema changes
 * without involving the user's Supabase SQL editor.
 *
 * Each statement is idempotent (IF NOT EXISTS / DO $$ guards),
 * so re-running this endpoint is safe — it returns the per-
 * statement result either way.
 *
 * The two migrations bundled here:
 *   - 20260603_square_message_views: distinct viewer counter on
 *     SquareMessage + dedup table SquareMessageView (FK cascade).
 *   - 20260603_square_lock: per-Neighborhood admin lock columns
 *     (squareLockedAt / squareLockedUntil / squareLockedById).
 *
 * Trigger from the browser console while signed in as super-admin:
 *
 *   fetch('/api/admin/square/run-migrations',
 *         { method: 'POST', credentials: 'include' })
 *     .then(r => r.json()).then(console.log)
 *
 * Delete this endpoint after both migrations are confirmed applied.
 */
export async function POST(_req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true },
  })
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isSuperAdminRole(me.role)) {
    // 404 so this stays invisible to API probing.
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Each entry is one logical migration step. We execute them in
  // sequence so a failure on step N reports cleanly without
  // half-applying step N+1. Every statement is idempotent.
  const steps: Array<{ name: string; sql: string }> = [
    // ── 20260603_square_message_views ──
    {
      name: 'SquareMessage.viewCount column',
      sql: `ALTER TABLE "SquareMessage"
              ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0;`,
    },
    {
      name: 'SquareMessageView table',
      sql: `CREATE TABLE IF NOT EXISTS "SquareMessageView" (
              "id"        TEXT NOT NULL,
              "messageId" TEXT NOT NULL,
              "userId"    TEXT NOT NULL,
              "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT "SquareMessageView_pkey" PRIMARY KEY ("id")
            );`,
    },
    {
      name: 'SquareMessageView unique (messageId, userId)',
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS "SquareMessageView_messageId_userId_key"
              ON "SquareMessageView"("messageId", "userId");`,
    },
    {
      name: 'SquareMessageView index by messageId',
      sql: `CREATE INDEX IF NOT EXISTS "SquareMessageView_messageId_idx"
              ON "SquareMessageView"("messageId");`,
    },
    {
      name: 'SquareMessageView index by userId',
      sql: `CREATE INDEX IF NOT EXISTS "SquareMessageView_userId_idx"
              ON "SquareMessageView"("userId");`,
    },
    {
      name: 'SquareMessageView → SquareMessage FK (CASCADE)',
      sql: `DO $$
            BEGIN
              IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'SquareMessageView_messageId_fkey'
              ) THEN
                ALTER TABLE "SquareMessageView"
                  ADD CONSTRAINT "SquareMessageView_messageId_fkey"
                  FOREIGN KEY ("messageId") REFERENCES "SquareMessage"("id")
                  ON DELETE CASCADE ON UPDATE CASCADE;
              END IF;
            END $$;`,
    },

    // ── 20260603_square_lock ──
    {
      name: 'Neighborhood.squareLocked* columns',
      sql: `ALTER TABLE "Neighborhood"
              ADD COLUMN IF NOT EXISTS "squareLockedAt"    TIMESTAMP(3),
              ADD COLUMN IF NOT EXISTS "squareLockedUntil" TIMESTAMP(3),
              ADD COLUMN IF NOT EXISTS "squareLockedById"  TEXT;`,
    },
  ]

  const results: Array<{ name: string; ok: boolean; error?: string }> = []
  for (const step of steps) {
    try {
      await db.$executeRawUnsafe(step.sql)
      results.push({ name: step.name, ok: true })
    } catch (err) {
      const message = (err as Error)?.message || String(err)
      results.push({ name: step.name, ok: false, error: message.slice(0, 500) })
      // Don't continue past a hard failure — the next steps may
      // depend on the failed one. Surface the error and stop.
      console.error('[ADMIN_MIGRATE_SQUARE] step failed', step.name, message)
      break
    }
  }

  const allOk = results.every((r) => r.ok)
  console.log('[ADMIN_MIGRATE_SQUARE]', {
    actorId: me.id,
    allOk,
    stepCount: results.length,
    ts: new Date().toISOString(),
  })

  return NextResponse.json({
    ok: allOk,
    results,
  })
}

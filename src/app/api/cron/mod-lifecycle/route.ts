import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Daily sweep that maintains the moderator lifecycle:
 *
 *  - >30 days since lastModActionAt (or modApprovedAt if null) →
 *      flip modStatus from ACTIVE to INACTIVE. Role unchanged.
 *  - >60 days → flip to UNDER_REVIEW and push an in-app notification
 *      to the mod so they know they're in the review queue. Role
 *      still unchanged — only admin demote/suspend touches role.
 *
 * Recovery: the moment a mod performs any action, lib/modAudit.ts
 * re-activates them (INACTIVE → ACTIVE). UNDER_REVIEW and SUSPENDED
 * stay pinned until an admin resolves them explicitly.
 *
 * Auth: Vercel cron header OR bearer token (CRON_SECRET), matching
 * the pattern used by the other cron routes.
 */

const INACTIVE_DAYS = 30
const REVIEW_DAYS = 60

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }

async function handle(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') != null
  const auth = req.headers.get('authorization') || ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron) {
    if (!expected || auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const now = Date.now()
  const inactiveCutoff = new Date(now - INACTIVE_DAYS * 86400_000)
  const reviewCutoff   = new Date(now - REVIEW_DAYS   * 86400_000)

  // Candidate mods: only ACTIVE + INACTIVE statuses get swept. UNDER_REVIEW
  // and SUSPENDED are admin-managed terminal-ish states.
  const mods = await db.user.findMany({
    where: {
      role: 'NEIGHBORHOOD_MOD',
      modStatus: { in: ['ACTIVE', 'INACTIVE'] },
    },
    select: {
      id: true,
      modStatus: true,
      lastModActionAt: true,
      modApprovedAt: true,
    },
  })

  let flippedInactive = 0
  let flippedReview   = 0

  for (const m of mods) {
    // If the mod has never acted, use modApprovedAt as the anchor so
    // brand-new mods don't immediately trip inactivity.
    const anchor = m.lastModActionAt ?? m.modApprovedAt ?? null
    if (!anchor) continue

    if (anchor < reviewCutoff && m.modStatus !== 'UNDER_REVIEW') {
      await db.user.update({
        where: { id: m.id },
        data: { modStatus: 'UNDER_REVIEW' },
      })
      // Tell the mod they're under review so they can either act or
      // respond to the admin. Best-effort — no push, in-app only.
      db.notification.create({
        data: {
          type: 'SYSTEM',
          userId: m.id,
          actorId: m.id,
          actorName: 'النظام',
          title: 'حسابك قيد المراجعة',
          titleEn: 'Your mod account is under review',
          body: 'لم نرَ أي نشاط إشرافي منذ فترة. سيقوم الأدمن بمراجعة حالتك.',
          bodyEn: 'No moderator activity detected recently. An admin will review your status.',
        },
      }).catch(() => {})
      flippedReview++
    } else if (anchor < inactiveCutoff && m.modStatus === 'ACTIVE') {
      await db.user.update({
        where: { id: m.id },
        data: { modStatus: 'INACTIVE' },
      })
      flippedInactive++
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: mods.length,
    flippedInactive,
    flippedReview,
    cutoffs: {
      inactive: inactiveCutoff.toISOString(),
      review: reviewCutoff.toISOString(),
    },
  })
}

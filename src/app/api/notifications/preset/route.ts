import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import type { NotificationPreset } from '@prisma/client'
import { ALL_CATEGORIES, PRESET_PUSH } from '@/lib/notifications/presets'

const VALID: NotificationPreset[] = ['URGENT_ONLY', 'BALANCED', 'EVERYTHING', 'MANUAL']

/**
 * PATCH /api/notifications/preset
 *
 * Body: { preset: NotificationPreset }
 *
 *   - For URGENT_ONLY / BALANCED / EVERYTHING:
 *       update User.notificationPreset
 *       overwrite every NotificationPreference.pushEnabled row to match
 *       PRESET_PUSH[preset]
 *
 *   - For MANUAL:
 *       update User.notificationPreset
 *       guarantee a row exists for every category (createMany skipDuplicates).
 *       Existing rows are NOT modified — that's the contract that lets
 *       MANUAL preserve the user's current toggles.
 */
export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { preset?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const preset = body.preset as NotificationPreset
  if (!preset || !VALID.includes(preset)) {
    return NextResponse.json({ error: 'Invalid preset' }, { status: 400 })
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: session.userId },
      data:  { notificationPreset: preset },
    })

    if (preset === 'MANUAL') {
      // Guarantee rows exist so the bulk-loader path matches the
      // single-user path. categoryAllowed's MANUAL fallback should be
      // unreachable in practice.
      await tx.notificationPreference.createMany({
        data: ALL_CATEGORIES.map((category) => ({
          userId: session.userId,
          category,
          pushEnabled: true,
          inAppEnabled: true,
        })),
        skipDuplicates: true,
      })
    } else {
      const map = PRESET_PUSH[preset]
      // Upsert every category — preset is the source of truth here.
      for (const cat of ALL_CATEGORIES) {
        await tx.notificationPreference.upsert({
          where:  { userId_category: { userId: session.userId, category: cat } },
          create: { userId: session.userId, category: cat, pushEnabled: map[cat], inAppEnabled: true },
          update: { pushEnabled: map[cat] },
        })
      }
    }
  })

  const rows = await db.notificationPreference.findMany({
    where: { userId: session.userId },
    orderBy: { category: 'asc' },
  })

  return NextResponse.json({
    preset,
    preferences: rows.map((r) => ({
      category:     r.category,
      pushEnabled:  r.pushEnabled,
      inAppEnabled: r.inAppEnabled,
    })),
  })
}

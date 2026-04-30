import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  createDefaultPreferences,
  getPreferencesMap,
} from '@/lib/notifications/preferences'
import { ALL_CATEGORIES } from '@/lib/notifications/presets'
import type { PostCategory } from '@prisma/client'

const VALID_CATEGORIES = ALL_CATEGORIES

/**
 * GET /api/notifications/preferences
 *
 * Returns the full preference set for the current user. Categories
 * the user has never explicitly set come back as the default ON state
 * (push=true, inApp=true). On first call we eagerly persist the
 * default rows so subsequent PATCHes can use updateMany cleanly.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await createDefaultPreferences(session.userId)
  const [map, user] = await Promise.all([
    getPreferencesMap(session.userId),
    db.user.findUnique({
      where: { id: session.userId },
      select: { notificationPreset: true },
    }),
  ])

  return NextResponse.json({
    preset: user?.notificationPreset ?? 'BALANCED',
    preferences: Array.from(map.values()).map((p) => ({
      category: p.category,
      pushEnabled: p.pushEnabled,
      inAppEnabled: p.inAppEnabled,
    })),
  })
}

/**
 * PATCH /api/notifications/preferences
 *
 * Body shape:
 *   { category: PostCategory, pushEnabled?: boolean, inAppEnabled?: boolean }
 * OR a batch:
 *   { updates: Array<{ category, pushEnabled?, inAppEnabled? }> }
 *
 * Returns the updated row(s). Idempotent — if a row doesn't exist yet,
 * it gets created with the patched fields (defaulting the unset side
 * to ON).
 */
export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Array<{
    category: PostCategory
    pushEnabled?: boolean
    inAppEnabled?: boolean
  }> = Array.isArray(body?.updates) ? body.updates : [body]

  for (const u of updates) {
    if (!u || !VALID_CATEGORIES.includes(u.category)) {
      return NextResponse.json({ error: 'Unknown category' }, { status: 400 })
    }
  }

  // Atomically: write the updates AND demote the user's preset to
  // MANUAL if it was anything else. The state machine contract:
  // a single per-category edit means the user is no longer on a
  // preset — flip it now so the UI cannot lie.
  const result = await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: session.userId },
      data: { notificationPreset: 'MANUAL' },
    })
    return Promise.all(
      updates.map((u) =>
        tx.notificationPreference.upsert({
          where: { userId_category: { userId: session.userId, category: u.category } },
          create: {
            userId: session.userId,
            category: u.category,
            pushEnabled: u.pushEnabled ?? true,
            inAppEnabled: u.inAppEnabled ?? true,
          },
          update: {
            ...(u.pushEnabled  !== undefined && { pushEnabled:  u.pushEnabled  }),
            ...(u.inAppEnabled !== undefined && { inAppEnabled: u.inAppEnabled }),
          },
        }),
      ),
    )
  })

  return NextResponse.json({
    preset: 'MANUAL',
    preferences: result.map((r) => ({
      category: r.category,
      pushEnabled: r.pushEnabled,
      inAppEnabled: r.inAppEnabled,
    })),
  })
}

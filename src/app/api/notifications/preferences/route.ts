import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  createDefaultPreferences,
  getPreferencesMap,
} from '@/lib/notifications/preferences'
import type { PostCategory } from '@prisma/client'

const VALID_CATEGORIES: PostCategory[] = [
  'HOME_BUSINESSES',
  'MARKETPLACE',
  'SERVICES',
  'RIDES',
  'REAL_ESTATE',
  'LOST_FOUND',
  'NEIGHBORHOOD_REPORTS',
  'EVENTS',
  'COMPETITIONS',
  'GENERAL',
]

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
  const map = await getPreferencesMap(session.userId)

  return NextResponse.json({
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

  const result = await db.$transaction(
    updates.map((u) =>
      db.notificationPreference.upsert({
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

  return NextResponse.json({
    preferences: result.map((r) => ({
      category: r.category,
      pushEnabled: r.pushEnabled,
      inAppEnabled: r.inAppEnabled,
    })),
  })
}

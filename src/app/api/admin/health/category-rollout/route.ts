import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isSuperAdminRole } from '@/lib/isSuperAdmin'
import { db } from '@/lib/db'
import { readCategorySnapshot } from '@/lib/posts/readCategory'
import { FLAGS } from '@/lib/flags'

/**
 * GET /api/admin/health/category-rollout
 *
 * Phase 3 observability. Returns:
 *
 *   • Current feature-flag state
 *   • In-memory read counters since last cold start
 *     (total / newCategoryUsed / legacyFallback / mismatch)
 *   • DB-side snapshot:
 *       - rows missing newCategory  (must be 0 after Phase 2)
 *       - mismatch rows where mapLegacy(category) != newCategory
 *
 * Use this to drive the "soak window" decision: only flip
 * USE_NEW_CATEGORY = true after the DB-side mismatch count has been 0
 * for a full release cycle and the in-memory counters show every
 * read finding a non-null newCategory.
 *
 * Super-admin gated.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  })
  if (!isSuperAdminRole(me?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // DB-side rollout health
  const [totalPosts, missingNewCategory] = await Promise.all([
    db.post.count(),
    db.post.count({ where: { newCategory: null } }),
  ])

  // Run the same legacy → v2 mapping the read helper would, in SQL,
  // and count the rows where newCategory disagrees with what the
  // legacy column would imply. The CASE here MUST stay in sync with
  // src/lib/postCategory.ts classifyLegacy(); a divergence here =
  // bug in classifyLegacy or in the dual-write code.
  const mismatchRows = await db.$queryRawUnsafe<Array<{ n: bigint }>>(`
    SELECT COUNT(*)::bigint AS n
    FROM "Post"
    WHERE "newCategory" IS NOT NULL
      AND "newCategory" <> CASE category
        WHEN 'FOOD_HOME'           THEN 'HOME_BUSINESSES'::"PostCategoryV2"
        WHEN 'MARKETPLACE'         THEN 'MARKETPLACE'::"PostCategoryV2"
        WHEN 'SERVICES'            THEN 'SERVICES'::"PostCategoryV2"
        WHEN 'REAL_ESTATE'         THEN 'REAL_ESTATE'::"PostCategoryV2"
        WHEN 'LOST_FOUND'          THEN 'LOST_FOUND'::"PostCategoryV2"
        WHEN 'RIDE_REQUEST'        THEN 'RIDES'::"PostCategoryV2"
        WHEN 'LOOKING_FOR'         THEN 'SERVICES'::"PostCategoryV2"
        WHEN 'NEIGHBORHOOD_ISSUE'  THEN 'NEIGHBORHOOD_REPORTS'::"PostCategoryV2"
        WHEN 'ALERT'               THEN 'NEIGHBORHOOD_REPORTS'::"PostCategoryV2"
        WHEN 'MOSQUE'              THEN 'EVENTS'::"PostCategoryV2"
        WHEN 'EID_RAMADAN'         THEN 'EVENTS'::"PostCategoryV2"
        WHEN 'CONTESTS'            THEN 'COMPETITIONS'::"PostCategoryV2"
        WHEN 'WOMEN_ONLY'          THEN 'SERVICES'::"PostCategoryV2"
        WHEN 'GENERAL'             THEN 'GENERAL'::"PostCategoryV2"
      END
  `)
  const mismatchCount = Number(mismatchRows?.[0]?.n ?? 0)

  return NextResponse.json({
    flags: FLAGS,
    db: {
      totalPosts,
      missingNewCategory,
      mismatchCount,
      // Phase 3 done = both of these = 0
      isReadyForFlagFlip: missingNewCategory === 0 && mismatchCount === 0,
    },
    process: readCategorySnapshot(), // in-memory counters since cold start
  })
}

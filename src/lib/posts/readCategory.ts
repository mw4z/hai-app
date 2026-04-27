/**
 * readCategory — the ONLY way the rest of the app should derive a
 * Post's effective v2 category from a row in the DB during Phase 3.
 *
 * Behavior:
 *   • If FLAGS.USE_NEW_CATEGORY is true and the row has a non-null
 *     newCategory, return it directly.
 *   • Otherwise (or as a safety fallback when newCategory is null on a
 *     row that pre-dates Phase 2), map the legacy category through
 *     classifyLegacy and return that.
 *
 * Mismatches between the two are logged when LOG_CATEGORY_MISMATCH is
 * on. Phase 3 done = zero mismatches over a soak window.
 */

import type {
  Post,
  PostCategory,
  PostCategoryV2,
} from '@prisma/client'
import { classifyLegacy } from '@/lib/postCategory'
import { FLAGS } from '@/lib/flags'

interface MinimalRead {
  id?: string
  category: PostCategory
  newCategory?: PostCategoryV2 | null
}

export function readCategory(post: MinimalRead): PostCategoryV2 {
  const fromLegacy = classifyLegacy(post.category).category
  const fromNew = post.newCategory

  // Mismatch surfacing — runs regardless of the flag so we catch dual-
  // write bugs even when the read side hasn't flipped yet.
  if (
    FLAGS.LOG_CATEGORY_MISMATCH &&
    fromNew != null &&
    fromNew !== fromLegacy
  ) {
    // Single-line console.warn — picked up by Vercel logs / Sentry.
    console.warn(
      '[postCategory] mismatch',
      JSON.stringify({
        postId: post.id ?? null,
        legacy: post.category,
        newCategory: fromNew,
        derivedFromLegacy: fromLegacy,
      }),
    )
  }

  if (FLAGS.USE_NEW_CATEGORY && fromNew != null) return fromNew
  return fromLegacy
}

/**
 * Bulk variant — operates on an array of posts and emits a single
 * structured summary log entry instead of one per row. Use in feed
 * queries where calling readCategory per item would generate noise.
 */
export function readCategoriesBulk<T extends MinimalRead>(
  posts: T[],
): PostCategoryV2[] {
  let mismatchCount = 0
  const out: PostCategoryV2[] = []
  for (const p of posts) {
    const fromLegacy = classifyLegacy(p.category).category
    if (p.newCategory != null && p.newCategory !== fromLegacy) mismatchCount++
    out.push(
      FLAGS.USE_NEW_CATEGORY && p.newCategory != null ? p.newCategory : fromLegacy,
    )
  }
  if (FLAGS.LOG_CATEGORY_MISMATCH && mismatchCount > 0) {
    console.warn(
      '[postCategory] bulk mismatches',
      JSON.stringify({ total: posts.length, mismatches: mismatchCount }),
    )
  }
  return out
}

/**
 * Telemetry helper — increments process counters that you can drain
 * from /api/admin/health into a metrics endpoint. Stateless, in-memory,
 * resets on cold start — fine for "% of reads using newCategory" since
 * that's a soak-window observability number, not a billing metric.
 */
const counters = {
  total: 0,
  newCategoryUsed: 0,
  legacyFallback: 0,
  mismatch: 0,
}

export function readCategoryWithTelemetry(post: MinimalRead): PostCategoryV2 {
  counters.total++
  const fromLegacy = classifyLegacy(post.category).category
  const fromNew = post.newCategory
  if (fromNew != null && fromNew !== fromLegacy) counters.mismatch++

  if (FLAGS.USE_NEW_CATEGORY && fromNew != null) {
    counters.newCategoryUsed++
    if (
      FLAGS.LOG_CATEGORY_MISMATCH &&
      fromNew !== fromLegacy
    ) {
      console.warn(
        '[postCategory] mismatch',
        JSON.stringify({ postId: post.id ?? null, legacy: post.category, newCategory: fromNew, derivedFromLegacy: fromLegacy }),
      )
    }
    return fromNew
  }
  counters.legacyFallback++
  return fromLegacy
}

export function readCategorySnapshot() {
  return { ...counters }
}

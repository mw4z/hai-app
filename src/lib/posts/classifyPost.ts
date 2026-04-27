/**
 * classifyPost — the ONLY function that produces a (legacy + v2) tuple.
 *
 * Every Post create / update path in the app must call this. No other
 * file is allowed to derive `legacyCategory`, `newCategory`, `intent`,
 * `priority`, or `audience` independently. If you find yourself
 * tempted to map elsewhere — extend this function instead.
 *
 * Two input shapes are supported:
 *
 *   1) v2-native call sites (new composer, edit screen, future code)
 *      pass the v2 tuple directly. We derive the legacy column from
 *      legacyOf().
 *
 *   2) legacy call sites (old API routes that haven't been migrated
 *      yet) pass a legacy `category` enum. We derive the v2 tuple from
 *      classifyLegacy().
 *
 * Both produce the SAME shape so every write is uniform.
 */

import type {
  PostCategory,
  PostCategoryV2,
  PostIntent,
  PostPriority,
  PostAudience,
} from '@prisma/client'
import { classifyLegacy, legacyOf } from '@/lib/postCategory'

export interface ClassifiedWrite {
  legacyCategory: PostCategory
  newCategory: PostCategoryV2
  intent: PostIntent
  priority: PostPriority
  audience: PostAudience
}

export type ClassifyInput =
  | {
      kind: 'v2'
      newCategory: PostCategoryV2
      intent?: PostIntent
      priority?: PostPriority
      audience?: PostAudience
    }
  | {
      kind: 'legacy'
      legacyCategory: PostCategory
      // optional overrides — used by the LOOKING_FOR / RIDE_REQUEST
      // flows where the caller knows more about intent than the legacy
      // value alone reveals.
      intent?: PostIntent
      priority?: PostPriority
      audience?: PostAudience
    }

export function classifyPost(input: ClassifyInput): ClassifiedWrite {
  if (input.kind === 'v2') {
    const newCategory = input.newCategory
    const legacyCategory = legacyOf(newCategory)
    // Intent / priority / audience default rules for v2 input. Callers
    // can override; otherwise we look at the v2 category to derive
    // sensible defaults that match how Phase 2 backfilled.
    const v2Defaults = defaultsForV2(newCategory)
    return {
      legacyCategory,
      newCategory,
      intent:   input.intent   ?? v2Defaults.intent,
      priority: input.priority ?? v2Defaults.priority,
      audience: input.audience ?? v2Defaults.audience,
    }
  }

  // kind === 'legacy'
  const classified = classifyLegacy(input.legacyCategory)
  return {
    legacyCategory: input.legacyCategory,
    newCategory:    classified.category,
    intent:         input.intent   ?? classified.intent,
    priority:       input.priority ?? classified.priority,
    audience:       input.audience ?? classified.audience,
  }
}

/**
 * Defaults for v2-native call sites. Mirrors the secondary-field
 * conventions used by Phase 2 SQL so a write with kind='v2' produces
 * the same tuple shape that already exists in the DB for similar rows.
 */
function defaultsForV2(category: PostCategoryV2): {
  intent: PostIntent
  priority: PostPriority
  audience: PostAudience
} {
  switch (category) {
    case 'LOST_FOUND':
    case 'NEIGHBORHOOD_REPORTS':
      return { intent: 'NORMAL', priority: 'HIGH', audience: 'ALL' }
    default:
      return { intent: 'NORMAL', priority: 'NORMAL', audience: 'ALL' }
  }
}

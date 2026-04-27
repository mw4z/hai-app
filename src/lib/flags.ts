/**
 * Process-wide feature flags. Read once at module load. Setting an env
 * var requires a deploy to flip — that's intentional for read-side
 * switches like USE_NEW_CATEGORY where you want a clean atomic flip
 * across all instances.
 *
 * For instant rollback during Phase 3:
 *   1. Vercel Dashboard → Project Settings → Environment Variables
 *   2. Set USE_NEW_CATEGORY = "false"
 *   3. Redeploy (or change the env var on a running deployment — Vercel
 *      will roll the change out within a minute)
 *   4. All reads fall back to mapLegacy(category) for safety
 *
 * Default for missing/unset value during Phase 3 rollout is FALSE
 * (legacy reads). Flip to TRUE only after dual-writes have soaked
 * through one full release cycle and the mismatch logs are clean.
 */

function readBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]
  if (raw == null) return defaultValue
  const v = raw.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

export const FLAGS = {
  /**
   * When true, reads use Post.newCategory directly (with safety fallback
   * to mapLegacy on missing values). When false, all reads go through
   * mapLegacy(post.category) regardless of what's in newCategory.
   *
   * Writes are NOT affected — dual-write is unconditional in
   * classifyPost(). The flag only controls the read side.
   */
  USE_NEW_CATEGORY: readBool('USE_NEW_CATEGORY', false),

  /**
   * When true, the read-side helper logs every (post.newCategory ≠
   * mapLegacy(post.category)) mismatch with the post id. Use during
   * Phase 3 rollout to find rows the dual-write missed. Disable after
   * the mismatch rate is provably zero.
   */
  LOG_CATEGORY_MISMATCH: readBool('LOG_CATEGORY_MISMATCH', true),
}

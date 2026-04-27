-- ════════════════════════════════════════════════════════════════════
-- Phase 1 rollback. Run ONLY if Phase 1 has not yet been combined with
-- Phase 2's backfill. Drops the new enums + columns + table.
-- ════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS "NotificationPreference";

DROP INDEX IF EXISTS "Post_neighborhoodId_newCategory_status_idx";

ALTER TABLE "Post"
  DROP COLUMN IF EXISTS "newCategory",
  DROP COLUMN IF EXISTS "intent",
  DROP COLUMN IF EXISTS "priority",
  DROP COLUMN IF EXISTS "audience";

DROP TYPE IF EXISTS "PostAudience";
DROP TYPE IF EXISTS "PostPriority";
DROP TYPE IF EXISTS "PostIntent";
DROP TYPE IF EXISTS "PostCategoryV2";

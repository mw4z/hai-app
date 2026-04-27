-- ════════════════════════════════════════════════════════════════════
-- Phase 4: Cleanup. Run ONLY after:
--   • Phase 1 + 2 applied
--   • All application code reads/writes via newCategory (Phase 3)
--   • A soak period of at least one full release cycle with zero
--     errors referencing the legacy column
--
-- This migration is destructive. There is no automatic rollback —
-- restore from the snapshot taken before applying.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Drop the legacy index that referenced the old column ────────────
DROP INDEX IF EXISTS "Post_neighborhoodId_category_status_idx";

-- ── Drop the legacy column ──────────────────────────────────────────
ALTER TABLE "Post"
  DROP COLUMN "category";

-- ── Rename the v2 column into the canonical name ────────────────────
ALTER TABLE "Post"
  RENAME COLUMN "newCategory" TO "category";

-- ── Recreate the canonical (neighborhoodId, category, status) index
--    on the renamed column. The Phase-1 *_newCategory_status_idx
--    is dropped because the index name no longer matches the column.
DROP INDEX IF EXISTS "Post_neighborhoodId_newCategory_status_idx";
CREATE INDEX "Post_neighborhoodId_category_status_idx"
  ON "Post" ("neighborhoodId", "category", "status");

-- ── Drop the legacy enum and rename V2 → canonical name ─────────────
DROP TYPE "PostCategory";
ALTER TYPE "PostCategoryV2" RENAME TO "PostCategory";

-- The NotificationPreference.category column was typed as
-- PostCategoryV2 in Phase 1; the rename above propagates because
-- Postgres tracks the type by OID, not by name.

COMMIT;

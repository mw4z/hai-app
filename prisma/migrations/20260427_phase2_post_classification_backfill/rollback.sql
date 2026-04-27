-- Phase 2 rollback: clear the backfill, restore nullability. The new
-- columns themselves stay (Phase 1 owns those — see its rollback to
-- drop them entirely).

BEGIN;

ALTER TABLE "Post"
  ALTER COLUMN "newCategory" DROP NOT NULL,
  ALTER COLUMN "intent"      DROP NOT NULL,
  ALTER COLUMN "priority"    DROP NOT NULL,
  ALTER COLUMN "audience"    DROP NOT NULL;

UPDATE "Post"
SET "newCategory" = NULL,
    "intent"      = 'NORMAL',
    "priority"    = 'NORMAL',
    "audience"    = 'ALL';

COMMIT;

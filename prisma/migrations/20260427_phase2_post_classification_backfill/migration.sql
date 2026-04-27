-- ════════════════════════════════════════════════════════════════════
-- Phase 2: Backfill the new classification columns from the legacy
-- `category` column.
--
-- Idempotent: every UPDATE is gated on `newCategory IS NULL` so re-runs
-- are safe and only touch rows that haven't been migrated yet.
--
-- Explicit mapping — no guessing. Anything that doesn't match a rule
-- falls through to the final `GENERAL` row, which is the admin-only
-- fallback and a signal for follow-up triage.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Direct 1:1 mappings ──────────────────────────────────────────────
UPDATE "Post"
SET "newCategory" = 'HOME_BUSINESSES'
WHERE "newCategory" IS NULL AND "category" = 'FOOD_HOME';

UPDATE "Post"
SET "newCategory" = 'MARKETPLACE'
WHERE "newCategory" IS NULL AND "category" = 'MARKETPLACE';

UPDATE "Post"
SET "newCategory" = 'SERVICES'
WHERE "newCategory" IS NULL AND "category" = 'SERVICES';

UPDATE "Post"
SET "newCategory" = 'REAL_ESTATE'
WHERE "newCategory" IS NULL AND "category" = 'REAL_ESTATE';

UPDATE "Post"
SET "newCategory" = 'LOST_FOUND',
    "priority"    = 'HIGH'
WHERE "newCategory" IS NULL AND "category" = 'LOST_FOUND';

UPDATE "Post"
SET "newCategory" = 'NEIGHBORHOOD_REPORTS',
    "priority"    = 'HIGH'
WHERE "newCategory" IS NULL AND "category" = 'NEIGHBORHOOD_ISSUE';

UPDATE "Post"
SET "newCategory" = 'EVENTS'
WHERE "newCategory" IS NULL AND "category" IN ('MOSQUE', 'EID_RAMADAN');

UPDATE "Post"
SET "newCategory" = 'COMPETITIONS'
WHERE "newCategory" IS NULL AND "category" = 'CONTESTS';

-- ── Mappings with secondary-field semantics ──────────────────────────

-- RIDE_REQUEST → RIDES + intent=REQUEST
UPDATE "Post"
SET "newCategory" = 'RIDES',
    "intent"      = 'REQUEST'
WHERE "newCategory" IS NULL AND "category" = 'RIDE_REQUEST';

-- LOOKING_FOR → SERVICES + intent=REQUEST
-- (SERVICES is the most plausible default; UI never wrote
--  category=LOOKING_FOR alongside a meaningful sub-category in the
--  legacy schema, so we don't have better signal to discriminate.)
UPDATE "Post"
SET "newCategory" = 'SERVICES',
    "intent"      = 'REQUEST'
WHERE "newCategory" IS NULL AND "category" = 'LOOKING_FOR';

-- ALERT → NEIGHBORHOOD_REPORTS + priority=HIGH
-- (CRITICAL is reserved for the EmergencyAlert model — those don't
--  live in the Post table.)
UPDATE "Post"
SET "newCategory" = 'NEIGHBORHOOD_REPORTS',
    "priority"    = 'HIGH'
WHERE "newCategory" IS NULL AND "category" = 'ALERT';

-- WOMEN_ONLY → audience=WOMEN, category falls back to SERVICES
-- (WOMEN_ONLY in production is most often female-targeted services
--  and home businesses; SERVICES is the safer default than HOME_
--  BUSINESSES because the latter has stricter listing requirements.)
UPDATE "Post"
SET "newCategory" = 'SERVICES',
    "audience"    = 'WOMEN'
WHERE "newCategory" IS NULL AND "category" = 'WOMEN_ONLY';

-- GENERAL → keep as GENERAL (admin-only fallback bucket).
UPDATE "Post"
SET "newCategory" = 'GENERAL'
WHERE "newCategory" IS NULL AND "category" = 'GENERAL';

-- ── Blocking guard (BEFORE the GENERAL safety net) ──────────────────
-- We INTENTIONALLY do NOT silently sweep unmigrated rows into GENERAL.
-- If any row is still NULL at this point, it means the explicit
-- mapping table missed a legacy value — that's a data-correctness
-- bug we want surfaced LOUDLY, not papered over.
--
-- This DO block raises an exception (and rolls back the whole
-- transaction via the surrounding BEGIN/COMMIT) if any row would
-- otherwise need the GENERAL fallback.
DO $$
DECLARE
  unmigrated_count integer;
  unmigrated_categories text;
BEGIN
  SELECT COUNT(*) INTO unmigrated_count
  FROM "Post"
  WHERE "newCategory" IS NULL;

  IF unmigrated_count > 0 THEN
    SELECT string_agg(DISTINCT "category"::text, ', ')
      INTO unmigrated_categories
    FROM "Post"
    WHERE "newCategory" IS NULL;

    RAISE EXCEPTION
      'Phase 2 backfill incomplete: % rows still NULL on newCategory. Unmapped legacy categories: %. Add explicit mapping rules and re-run.',
      unmigrated_count, COALESCE(unmigrated_categories, '<none>');
  END IF;
END $$;

-- ── Make newCategory NOT NULL now that every row has a value ─────────
-- The guard above guarantees zero NULLs reach this statement; if any
-- did, this SET NOT NULL would also fail loudly — defense in depth.
ALTER TABLE "Post"
  ALTER COLUMN "newCategory" SET NOT NULL;

-- intent / priority / audience already had column defaults from
-- Phase 1, so any rows that didn't hit an UPDATE branch above are
-- already 'NORMAL'/'NORMAL'/'ALL'. Promote them to NOT NULL too.
ALTER TABLE "Post"
  ALTER COLUMN "intent"   SET NOT NULL,
  ALTER COLUMN "priority" SET NOT NULL,
  ALTER COLUMN "audience" SET NOT NULL;

COMMIT;
